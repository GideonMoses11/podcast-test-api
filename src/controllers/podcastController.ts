import { GoogleGenerativeAI } from "@google/generative-ai";
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { asyncHandler } from "../core";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
// import fetch from 'node-fetch';
import axios from 'axios';
import { promisify } from 'util';
import Podcast from "../models/Podcast";
import User from "../models/User";
import mongoose from "mongoose";
import PodcastAnalytics from "../models/PodcastAnalytics";
import TimingLog from '../models/TimingLog';

dotenv.config();


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const generateOptions = asyncHandler(async (req, res, next): Promise<void> => {
  try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
          res.status(400).json({ error: "Invalid prompt. Please provide a valid string." });
          return;
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Start timing
      const start = performance.now();

      // Generate options
      const results = await Promise.all(
          Array.from({ length: 6 }, () => model.generateContent(prompt))
      );

      const end = performance.now(); // End timing
      const duration = end - start; // Calculate total time taken

      // Map results into simpler options and truncate to 20 words
      const options = results.map((result) =>
          result.response.text().split(' ').slice(0, 20).join(' ')
      );

      // Store timing data in MongoDB
      await TimingLog.create({ processName: "gemini", duration, timestamp: new Date() });

      res.status(200).json({ options, duration });
  } catch (error) {
      console.error("Error generating content:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Failed to generate options." });
  }
});


AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  });
  
  const polly = new AWS.Polly();
  const s3 = new AWS.S3();

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

export const sendToPolly = asyncHandler(async (req, res, next) => {
  try {
    const startTime = Date.now();

    const { selectedOption, title, description } = req.body;
    if (!selectedOption || typeof selectedOption !== 'string') {
      res.status(400).json({ error: "Invalid option. Please provide a valid string." });
      return;
    }

    const params = {
      Text: selectedOption,
      OutputFormat: "mp3",
      VoiceId: "Emma",
    };

    const pollyResponse = await polly.synthesizeSpeech(params).promise();
    if (!pollyResponse.AudioStream) {
      res.status(500).json({ error: "Failed to synthesize speech." });
      return;
    }

    const fileName = `audio/${uuidv4()}.mp3`;
    const s3Params = {
      Bucket: 'gidi-polly-bucket',
      Key: fileName,
      Body: pollyResponse.AudioStream,
      ContentType: 'audio/mp3',
      ACL: 'public-read',
    };

    const s3UploadResponse = await s3.upload(s3Params).promise();
    if (!s3UploadResponse.Location) {
      res.status(500).json({ error: "Failed to upload audio to S3." });
      return;
    }

    // Fetch the file from S3 to analyze its duration
    const audioFileUrl = s3UploadResponse.Location;
    const localAudioPath = `/tmp/${uuidv4()}.mp3`;

    const response = await axios.get(audioFileUrl, { responseType: "stream" });

    if (!response.data) {
      throw new Error("Failed to fetch audio file; response body is null.");
    }

    const fileStream = fs.createWriteStream(localAudioPath);
    await new Promise<void>((resolve, reject) => {
      response.data!.pipe(fileStream);
      response.data!.on("error", (err: Error) => reject(err)); // Explicitly type the error
      fileStream.on("finish", () => resolve());
    });
    
    let durationInSeconds = 0;
    await new Promise<void>((resolve, reject) => {
      ffmpeg(localAudioPath)
        .ffprobe((err, metadata) => {
          if (err) {
            reject(err);
            return;
          }
          durationInSeconds = metadata.format.duration ?? 0; // Default to 0 if undefined
          resolve(undefined);
        });
    });

    await unlinkAsync(localAudioPath); // Clean up temporary file

    // Save podcast details, including duration
    const podcast = new Podcast({
      title,
      description,
      audioUrl: s3UploadResponse.Location,
      duration: durationInSeconds,
      uploadedBy: req.user.userId,
    });

    await podcast.save();

    const endTime = Date.now(); // End timing
    const duration = endTime - startTime; // Calculate duration in milliseconds

    // Save the duration in your database
    const timingLog = new TimingLog({
      processName: "polly_synthesis",
      duration,
      timestamp: new Date(),
    });
    await timingLog.save();

    res.status(200).json({ podcast, duration });
  } catch (error) {
    console.error("Error generating speech or uploading to S3:", error);
    res.status(500).json({ error: "Failed to convert text to speech or create podcast." });
  }
});



export const editPodcast = asyncHandler(async (req, res, next) => {

    const { id } = req.params;
    const { title, description } = req.body;
  
    try {
      const podcast = await Podcast.findByIdAndUpdate(
        id,
        { title, description },
        { new: true }
      );
  
      if (!podcast) {
        return res.status(404).json({ message: 'Podcast not found' });
      }
  
        res.status(200).json({ podcast });
      } catch (error) {
        console.error('Error updating podcast:', error);
        res.status(500).json({ message: 'Internal Server Error' });
      }
  });
  
  // Delete Podcast Controller
  export const deletePodcast = asyncHandler(async (req, res, next) => {
    try {
      const { podcastId } = req.params;
  
      if (!podcastId) {
        return res.status(400).json({ error: "Podcast ID is required to delete." });
      }
  
      const podcast = await Podcast.findById(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found." });
      }
  
      // Delete the audio file from S3 if it exists
      const audioFileUrl = podcast.audioUrl;
      if (audioFileUrl) {
        const fileName = audioFileUrl.split('/').pop(); // Extract filename from URL
        const s3Params = {
          Bucket: 'gidi-polly-bucket', // Your S3 bucket name
          Key: `audio/${fileName}`, // The file path in your S3 bucket
        };
  
        await s3.deleteObject(s3Params).promise();
      }
  
      // Delete the podcast entry from the database
      await podcast.deleteOne();
  
      res.status(200).json({ message: "Podcast deleted successfully." });
    } catch (error) {
      console.error("Error deleting podcast:", error);
      res.status(500).json({ error: "Failed to delete podcast." });
    }
  });

  export const getPodcast = asyncHandler(async (req, res, next) => {
    try {
      const { podcastId } = req.params;
  
      // Find the podcast by its ID and populate the user information
      const podcast = await Podcast.findById(podcastId).populate('uploadedBy', 'email'); // You can specify which fields to populate here
  
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found." });
      }
  
      // Return the podcast along with the user details
      res.status(200).json({ podcast });
    } catch (error) {
      console.error("Error retrieving podcast:", error);
      res.status(500).json({ error: "Failed to retrieve podcast." });
    }
  });

  export const getAllPodcasts = asyncHandler(async (req, res, next) => {
    try {
      // Fetch all podcasts and populate the 'uploadedBy' field
      const podcasts = await Podcast.find()
                                    .sort({ createdAt: -1 })
                                    .populate('uploadedBy', 'email');
  
      if (podcasts.length === 0) {
        return res.status(404).json({ error: "No podcasts found." });
      }
  
      // Return the list of podcasts
      res.status(200).json({ podcasts });
    } catch (error) {
      console.error("Error retrieving podcasts:", error);
      res.status(500).json({ error: "Failed to retrieve podcasts." });
    }
  });

export const getPodcastMetrics = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user.userId;

    console.log("userId", req.user.userId);

    // Ensure userId is a valid ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get total podcasts generated
    const totalPodcasts = await Podcast.countDocuments();

    // Get the number of podcasts generated by a specific user
    const userPodcasts = await Podcast.countDocuments({ uploadedBy: userObjectId });

    // Get the average number of podcasts per user
    const totalUsers = await User.countDocuments();
    const avgPodcastsPerUser = totalUsers > 0 ? totalPodcasts / totalUsers : 0;

    // Get the total number of users who have uploaded at least one podcast
    const usersWithUploads = await Podcast.distinct("uploadedBy");
    const totalUploadingUsers = usersWithUploads.length;

    // Get the average number of podcasts per uploading user
    const avgPodcastsPerUploadingUser = totalUploadingUsers > 0 ? totalPodcasts / totalUploadingUsers : 0;

    // Get total duration of all podcasts
    const totalDurationAllPodcasts = await Podcast.aggregate([
      { $group: { _id: null, totalDuration: { $sum: "$duration" } } }
    ]);

    // Get total duration of podcasts uploaded by the specific user
    const totalDurationUserPodcasts = await Podcast.aggregate([
      { $match: { uploadedBy: userObjectId } },  // Filter podcasts by the user
      { $group: { _id: null, totalDuration: { $sum: "$duration" } } }
    ]);

    // Prepare the response data
    res.status(200).json({
      totalUsers,
      totalPodcasts,
      userPodcasts,
      avgPodcastsPerUser,
      avgPodcastsPerUploadingUser,
      totalDurationAllPodcasts: totalDurationAllPodcasts.length > 0 ? totalDurationAllPodcasts[0].totalDuration : 0,
      totalDurationUserPodcasts: totalDurationUserPodcasts.length > 0 ? totalDurationUserPodcasts[0].totalDuration : 0,
    });
  } catch (error) {
    console.error("Error fetching podcast metrics:", error);
    res.status(500).json({ error: "Failed to fetch podcast metrics" });
  }
});

export const trackListenEvent = asyncHandler(async (req, res, next) => {
  
  console.log('User in request:', req.user.userId);
  const { podcastId, currentTime } = req.body;
  const userId = req.user.userId; // Assuming `req.user` contains authenticated user details

  try {
      // Find or create a podcast analytics record for the session
      let analytics = await PodcastAnalytics.findOne({
          userId,
          podcastId,
          sessionStart: { $gte: new Date().setHours(0, 0, 0, 0) }, // Ensure the session is for today
      });

      if (!analytics) {
          analytics = new PodcastAnalytics({
              userId,
              podcastId,
              sessionStart: new Date(),
              listenData: [],
              totalListenedTime: 0,
          });
      }

      // Update listenData and totalListenedTime
      analytics.listenData.push({ time: currentTime, timestamp: new Date() });
      analytics.totalListenedTime += currentTime;

      await analytics.save();

      res.status(200).json({ message: 'Listen event tracked successfully.' });
  } catch (error) {
      console.error('Error tracking listen event:', error);
      res.status(500).json({ error: 'Failed to track listen event.' });
  }
});

export const getUserTotalListenTime = asyncHandler(async (req, res, next) => {
  try {
    const { podcastId } = req.params;
    const userId = req.user.userId; // Get the authenticated user ID

    // Fetch the total listen time for the specific user and podcast
    const userAnalytics = await PodcastAnalytics.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), podcastId: new mongoose.Types.ObjectId(podcastId) } },
      { $group: { _id: null, totalListenTime: { $sum: "$totalListenedTime" } } }
    ]);

    const totalListenTime = userAnalytics.length > 0 ? userAnalytics[0].totalListenTime : 0;

    res.status(200).json({ totalListenTime });
  } catch (error) {
    console.error("Error fetching user listen time:", error);
    res.status(500).json({ error: "Failed to fetch user listen time." });
  }
});


export const getTotalListenTimeForPodcast = asyncHandler(async (req, res, next) => {
  try {
    const { podcastId } = req.params;

    // Fetch the total listen time for all users combined for a specific podcast
    const podcastAnalytics = await PodcastAnalytics.aggregate([
      { $match: { podcastId: new mongoose.Types.ObjectId(podcastId) } },
      { $group: { _id: null, totalListenTime: { $sum: "$totalListenedTime" } } }
    ]);

    const totalListenTime = podcastAnalytics.length > 0 ? podcastAnalytics[0].totalListenTime : 0;

    res.status(200).json({ totalListenTime });
  } catch (error) {
    console.error("Error fetching total listen time:", error);
    res.status(500).json({ error: "Failed to fetch total listen time for the podcast." });
  }
});

export const getGeminiAverageTiming = asyncHandler(async (req, res, next): Promise<void> => {
  try {
      let { startTime, endTime } = req.query;

      // If no query parameters are provided, set defaults to the past 24 hours
      const now = new Date();
      if (!startTime) {
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
      }
      if (!endTime) {
          endTime = now.toISOString(); // Current time
      }

      const start = new Date(startTime as string);
      const end = new Date(endTime as string);

      // Use aggregation to calculate the average duration
      const [result] = await TimingLog.aggregate([
          { $match: { processName: "gemini", timestamp: { $gte: start, $lte: end } } },
          { $group: { _id: null, averageDuration: { $avg: "$duration" } } },
      ]);

      // const averageTime = result?.averageDuration || 0;

      const averageTime = result?.averageDuration != null ? result.averageDuration.toFixed(2) : 0;

      res.status(200).json({ averageTime });
  } catch (error) {
      console.error("Error calculating average timing:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Failed to calculate average timing." });
  }
});

export const getPollyAverageTiming = asyncHandler(async (req, res, next) => {
  try {
    const { startTime, endTime } = req.query;

    // Default to last 24 hours if no query params are provided
    const start = startTime ? new Date(startTime as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endTime ? new Date(endTime as string) : new Date();

    // Use aggregation to calculate the average duration
    const [result] = await TimingLog.aggregate([
      { $match: { processName: "polly_synthesis", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: null, averageDuration: { $avg: "$duration" } } },
    ]);

    // const averageTime = result?.averageDuration || 0;

    const averageTime = result?.averageDuration != null ? result.averageDuration.toFixed(2) : 0;

    res.status(200).json({ averageTime });
  } catch (error) {
    console.error("Error calculating average Polly timing:", error);
    res.status(500).json({ error: "Failed to calculate average Polly timing." });
  }
});





  

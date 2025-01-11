const express = require('express');
const router = express.Router();
import { deletePodcast, editPodcast, generateOptions, getAllPodcasts, getGeminiAverageTiming, getPodcast, getPodcastMetrics, getPollyAverageTiming, getTotalListenTimeForPodcast, getUserTotalListenTime, sendToPolly, trackListenEvent } from "../controllers/podcastController";
import { authMiddleware } from "../middleware/authMiddleware";
import multer from 'multer';

// Set up multer storage and file handling
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.get('/metrics', authMiddleware, getPodcastMetrics);
router.get('/analytics/gemini', authMiddleware, getGeminiAverageTiming);
router.get('/analytics/polly', authMiddleware, getPollyAverageTiming);
router.post('/listen-event', authMiddleware, trackListenEvent);

router.post('/initialize', authMiddleware, generateOptions);
router.post('/add', authMiddleware, sendToPolly);
router.put('/edit/:id', authMiddleware, editPodcast); // Handle file upload and editing
router.delete('/delete/:podcastId', authMiddleware, deletePodcast);
router.get('', authMiddleware, getAllPodcasts);
router.get('/:podcastId/user-listen-time', authMiddleware, getUserTotalListenTime);

router.get('/:podcastId/total-listen-time', authMiddleware, getTotalListenTimeForPodcast);


router.get('/:podcastId', authMiddleware, getPodcast);


// router.post('/login', loginUser);

export default router;
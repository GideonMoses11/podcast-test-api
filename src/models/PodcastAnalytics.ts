import mongoose, { Schema } from 'mongoose';

const PodcastAnalyticsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    podcastId: { type: mongoose.Schema.Types.ObjectId, ref: 'Podcast', required: true, index: true },
    sessionStart: { type: Date, required: true },
    listenData: [
        {
            time: { type: Number, required: true }, // Time listened in seconds
            timestamp: { type: Date, required: true }, // Timestamp of the event
        },
    ],
    totalListenedTime: { type: Number, default: 0 }, // Total listening time in seconds
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('PodcastAnalytics', PodcastAnalyticsSchema);
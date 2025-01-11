import mongoose, { Schema } from 'mongoose';

const PodcastSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  audioUrl: { type: String, required: true },
  duration: { type: Number, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // References User
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Podcast', PodcastSchema);

import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  podcasts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Podcast' }], // Array of references to Podcast
});

export default mongoose.model('User', UserSchema);

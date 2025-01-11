import mongoose, { Schema } from 'mongoose';

const TimingLogSchema = new Schema({
    processName: { type: String },
    duration: {
        type: Number,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.model('TimingLog', TimingLogSchema);

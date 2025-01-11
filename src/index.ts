import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import { podcastRoutes, userRoutes } from './routes';
// import userRoutes from './routes/userRoutes';
// import podcastRoutes from './routes/podcastRoutes';

dotenv.config();

const app = express();
app.use(express.json());

app.use(cors());

// Routes
// app.use('/api/users', userRoutes);
// app.use('/api/podcasts', podcastRoutes);

app.use('/v1/auth', userRoutes)
app.use('/v1/podcasts', podcastRoutes)
// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI || '')
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Start server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;

export default app;


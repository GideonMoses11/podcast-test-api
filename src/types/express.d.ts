// src/types/express.d.ts

import { User } from './models/User'; // Import your User model if needed

declare global {
  namespace Express {
    interface Request {
      user?: User; // Declare the 'user' property, which could be the User model
    }
  }
}

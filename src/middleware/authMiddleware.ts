import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'sokratis';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Extract the Authorization header
  const authHeader = req.header('Authorization');
  
  // Check if the Authorization header is present and starts with 'Bearer'
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  // Extract the token (everything after 'Bearer ')
  const token = authHeader.split(' ')[1];

  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach the decoded user to the request object
    next(); // Allow the request to continue
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

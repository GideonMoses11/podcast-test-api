import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { asyncHandler } from '../core';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'sokratis';

export const createUser = asyncHandler(async (req, res, next) => {

    const { email, password } = req.body;
  
    try {
      // Check if user already exists
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
  
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Create a new user
      const user = new User({
        email,
        password: hashedPassword,
      });
  
      // Save the user
      await user.save();
  
      // Respond with success
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          email: user.email, // You can exclude sensitive data like the password
        },
      });
    } catch (error) {
      console.error('Error registering user:', error); // Log the error for debugging
      res.status(500).json({ message: 'Server error, please try again later' });
    }
});

export const loginUser = asyncHandler(async (req, res, next) => {

    const { email, password } = req.body;
  
    try {
      // Check if user already exists
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User does not exist' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
      
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '5d' });
        res.status(200).json({ "message": "user logged in successfully!", token });      
  
    } catch (error) {
      console.error('Error logging in user:', error); // Log the error for debugging
      res.status(500).json({ message: 'Server error, please try again later' });
    }
});

export const getAuthUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.status(200).json({ user: req.user });
});

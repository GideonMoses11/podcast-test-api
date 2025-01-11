const express = require('express');
const router = express.Router();
import { createUser, getAuthUser, loginUser } from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";



router.post('/register', createUser);
router.post('/login', loginUser);
router.get('/me', authMiddleware, getAuthUser);

export default router;
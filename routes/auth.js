const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");

require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

// Register (matching the EJS template route)
router.post("/register", async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already taken" });
        }

        const newUser = new User({ username, password });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: "7d" });
        res.status(201).json({ 
            token, 
            username: newUser.username,
            message: "User created successfully"
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: "Error creating user" });
    }
});

// Login
router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
        res.json({ 
            token, 
            username: user.username,
            user: { id: user._id, username: user.username }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: "Login failed" });
    }
});

module.exports = router;
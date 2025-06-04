// models/Game.js
const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
    whitePlayer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    blackPlayer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    whitePlayerUsername: {
        type: String,
        required: true
    },
    blackPlayerUsername: {
        type: String,
        required: true
    },
    moves: [
        {
            from: String,
            to: String,
            promotion: String,
            san: String, // standard algebraic notation
            timestamp: {
                type: Date,
                default: Date.now
            }
        }
    ],
    status: {
        type: String,
        enum: ['active', 'completed', 'abandoned', 'draw'],
        default: 'active'
    },
    result: {
        type: String, // e.g., "1-0", "0-1", "1/2-1/2"
        default: null
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    currentFEN: {
        type: String,
        default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' // starting position
    },
    finalFEN: {
        type: String,
        default: null
    },
    gameEndReason: {
        type: String,
        enum: ['checkmate', 'stalemate', 'draw', 'resignation', 'timeout', 'abandoned'],
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    }
});

// Index for faster queries
gameSchema.index({ whitePlayer: 1, blackPlayer: 1 });
gameSchema.index({ status: 1 });
gameSchema.index({ createdAt: -1 });

// Method to add a move to the game
gameSchema.methods.addMove = function(move) {
    this.moves.push(move);
    this.currentFEN = move.fen || this.currentFEN;
    return this.save();
};

// Method to complete the game
gameSchema.methods.completeGame = function(result, winner, reason, finalFEN) {
    this.status = 'completed';
    this.result = result;
    this.winner = winner;
    this.gameEndReason = reason;
    this.finalFEN = finalFEN;
    this.completedAt = new Date();
    return this.save();
};

module.exports = mongoose.model("Game", gameSchema);
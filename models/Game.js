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
    },
    
    // TIMER FIELDS - Added without conflicts
    timeControl: {
        type: Number, // in seconds (e.g., 300 for 5 minutes)
        default: 300
    },
    whiteTimeLeft: {
        type: Number,
        default: 300
    },
    blackTimeLeft: {
        type: Number,
        default: 300
    },
    lastMoveAt: {
        type: Date,
        default: null
    },
    currentPlayerStartTime: {
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

// NEW TIMER METHODS - Added without conflicts
gameSchema.methods.startTimer = function(player) {
    this.currentPlayerStartTime = new Date();
    if (!this.lastMoveAt) {
        this.lastMoveAt = new Date();
    }
    return this.save();
};

gameSchema.methods.updateTimeAfterMove = function() {
    if (!this.currentPlayerStartTime) return this.save();
    
    const now = new Date();
    const timeUsed = Math.floor((now - this.currentPlayerStartTime) / 1000);
    
    // Determine current player from FEN
    const isWhiteTurn = this.currentFEN.includes(' w ');
    
    if (isWhiteTurn) {
        // White just moved, deduct time from white
        this.whiteTimeLeft = Math.max(0, this.whiteTimeLeft - timeUsed);
    } else {
        // Black just moved, deduct time from black
        this.blackTimeLeft = Math.max(0, this.blackTimeLeft - timeUsed);
    }
    
    // Check for timeout
    if (this.whiteTimeLeft <= 0 || this.blackTimeLeft <= 0) {
        const timeoutWinner = this.whiteTimeLeft <= 0 ? this.blackPlayer : this.whitePlayer;
        const timeoutResult = this.whiteTimeLeft <= 0 ? '0-1' : '1-0';
        return this.completeGame(timeoutResult, timeoutWinner, 'timeout', this.currentFEN);
    }
    
    this.lastMoveAt = now;
    this.currentPlayerStartTime = now; // Start timer for next player
    
    return this.save();
};

gameSchema.methods.getCurrentTimeRemaining = function() {
    if (this.status !== 'active' || !this.currentPlayerStartTime) {
        return {
            white: this.whiteTimeLeft,
            black: this.blackTimeLeft
        };
    }
    
    const now = new Date();
    const elapsed = Math.floor((now - this.currentPlayerStartTime) / 1000);
    const isWhiteTurn = this.currentFEN.includes(' w ');
    
    return {
        white: isWhiteTurn ? Math.max(0, this.whiteTimeLeft - elapsed) : this.whiteTimeLeft,
        black: !isWhiteTurn ? Math.max(0, this.blackTimeLeft - elapsed) : this.blackTimeLeft
    };
};

module.exports = mongoose.model("Game", gameSchema);
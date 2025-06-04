const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const connectDB = require("./config/db");
const { Chess } = require("chess.js");
const jwt = require("jsonwebtoken");
const Game = require("./models/Game");
const User = require("./models/User"); // ✅ Import User model

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

//images
app.use(express.static('assets'));
// Routes
app.use("/api/auth", authRoutes);

app.get("/login", (req, res) => {
    res.render("login", { title: "Login - Chess Game" });
});

app.get("/register", (req, res) => {
    res.render("register", { title: "Register - Chess Game" });
});

app.get("/", (req, res) => {
    res.render("index", { title: "Online Chess Game" });
});

app.get("/logout", (req, res) => {
    res.redirect("/login");
});

// 🔐 Authenticate Socket.IO users
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    
    if (!token) {
        return next(new Error("Authentication error: Token missing"));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        console.log(`User authenticated: ${decoded.id}`);
        next();
    } catch (err) {
        console.log("Authentication failed:", err.message);
        return next(new Error("Authentication error: Invalid token"));
    }
});

// 🎯 Chess Game Logic
const chess = new Chess();
let players = {}; // { white: userId, black: userId }
let playerSockets = {}; // { userId: socketId }
let gameState = {
    isActive: false,
    whitePlayer: null,
    blackPlayer: null,
    spectators: [],
    dbGame: null // ✅ Track the database game document
};

// 🔌 Socket.io Events
io.on("connection", async (socket) => {
    const userId = socket.user.id;
    console.log(`Authenticated user connected: ${userId} (${socket.id})`);
    
    try {
        // ✅ Fetch user data from database to get username
        const user = await User.findById(userId);
        if (!user) {
            return socket.emit("error", "User not found");
        }
        
        const username = user.username;
        console.log(`User ${username} (${userId}) connected`);
        
        // Store socket mapping
        playerSockets[userId] = socket.id;

        // 👥 Assign player roles
        if (!players.white) {
            players.white = userId;
            gameState.whitePlayer = { id: userId, username };
            gameState.isActive = false; // Wait for black player
            socket.emit("playerRole", "w");
            console.log(`${username} assigned as White player`);
        } else if (!players.black) {
            players.black = userId;
            gameState.blackPlayer = { id: userId, username };
            socket.emit("playerRole", "b");
            console.log(`${username} assigned as Black player`);
            
            // ✅ Create new game in database
            try {
                const newGame = await Game.create({
                    whitePlayer: gameState.whitePlayer.id,
                    whitePlayerUsername: gameState.whitePlayer.username,
                    blackPlayer: gameState.blackPlayer.id,
                    blackPlayerUsername: gameState.blackPlayer.username
                });
                
                gameState.dbGame = newGame;
                gameState.isActive = true; // Game can start
                console.log(`New game created in database: ${newGame._id}`);
                
                // Notify both players game is ready
                io.emit("gameReady", {
                    white: players.white,
                    black: players.black,
                    whiteUsername: gameState.whitePlayer.username,
                    blackUsername: gameState.blackPlayer.username
                });
            } catch (dbError) {
                console.error("Error creating game in database:", dbError);
                socket.emit("error", "Failed to create game");
            }
        } else {
            // Add as spectator
            gameState.spectators.push(userId);
            socket.emit("spectatorRole");
            console.log(`${username} joined as spectator`);
            
            // Send current board state to spectator
            socket.emit("boardState", chess.fen());
        }

        // 📡 Send current game state to new connection
        if (gameState.isActive) {
            socket.emit("boardState", chess.fen());
        }

        // 🎮 Handle chess moves
        socket.on("move", async (move) => {
            try {
                const currentTurn = chess.turn();
                const isWhiteTurn = currentTurn === "w";
                const isBlackTurn = currentTurn === "b";

                // 🚫 Check if user is authorized to move
                if (isWhiteTurn && userId !== players.white) {
                    return socket.emit("unauthorizedMove", "Not your turn - White to move");
                }
                
                if (isBlackTurn && userId !== players.black) {
                    return socket.emit("unauthorizedMove", "Not your turn - Black to move");
                }

                // 🚫 Check if game is active
                if (!gameState.isActive) {
                    return socket.emit("unauthorizedMove", "Game not active - waiting for players");
                }

                // ♟️ Attempt the move
                const result = chess.move(move);
                
                if (result) {
                    // ✅ Valid move - broadcast to all clients
                    io.emit("move", move);
                    io.emit("boardState", chess.fen());
                    
                    console.log(`Move made by ${username}: ${move.from} to ${move.to}`);

                    // ✅ Save move to database
                    if (gameState.dbGame) {
                        try {
                            await gameState.dbGame.addMove({
                                from: result.from,
                                to: result.to,
                                promotion: result.promotion,
                                san: result.san,
                                fen: chess.fen()
                            });
                            console.log("Move saved to database");
                        } catch (dbError) {
                            console.error("Error saving move to database:", dbError);
                        }
                    }

                    // 🏁 Check for game end conditions
                    if (chess.isCheckmate()) {
                        const winner = chess.turn() === "w" ? "Black" : "White";
                        const winnerId = chess.turn() === "w" ? players.black : players.white;
                        const resultText = chess.turn() === "w" ? "0-1" : "1-0";
                        
                        io.emit("gameOver", `Checkmate! ${winner} wins!`);
                        gameState.isActive = false;
                        console.log(`Game Over: ${winner} wins by checkmate`);
                        
                        // ✅ Complete game in database
                        if (gameState.dbGame) {
                            try {
                                await gameState.dbGame.completeGame(
                                    resultText,
                                    winnerId,
                                    'checkmate',
                                    chess.fen()
                                );
                                console.log("Game completed in database");
                            } catch (dbError) {
                                console.error("Error completing game in database:", dbError);
                            }
                        }
                    } else if (chess.isStalemate()) {
                        io.emit("gameOver", "Game Over: Stalemate - It's a draw!");
                        gameState.isActive = false;
                        console.log("Game Over: Stalemate");
                        
                        // ✅ Complete game in database
                        if (gameState.dbGame) {
                            try {
                                await gameState.dbGame.completeGame(
                                    '1/2-1/2',
                                    null,
                                    'stalemate',
                                    chess.fen()
                                );
                                console.log("Game completed in database (stalemate)");
                            } catch (dbError) {
                                console.error("Error completing game in database:", dbError);
                            }
                        }
                    } else if (chess.isDraw()) {
                        io.emit("gameOver", "Game Over: Draw!");
                        gameState.isActive = false;
                        console.log("Game Over: Draw");
                        
                        // ✅ Complete game in database
                        if (gameState.dbGame) {
                            try {
                                await gameState.dbGame.completeGame(
                                    '1/2-1/2',
                                    null,
                                    'draw',
                                    chess.fen()
                                );
                                console.log("Game completed in database (draw)");
                            } catch (dbError) {
                                console.error("Error completing game in database:", dbError);
                            }
                        }
                    } else if (chess.isCheck()) {
                        const playerInCheck = chess.turn() === "w" ? "White" : "Black";
                        io.emit("check", `${playerInCheck} is in check!`);
                        console.log(`${playerInCheck} is in check`);
                    }
                    
                } else {
                    // ❌ Invalid move
                    socket.emit("invalidMove", move);
                    console.log(`Invalid move attempted by ${username}:`, move);
                }
                
            } catch (error) {
                console.error("Error processing move:", error);
                socket.emit("invalidMove", move);
            }
        });

        // 🔄 Handle game reset request
        socket.on("requestNewGame", async () => {
            // Only players can request new game
            if (userId === players.white || userId === players.black) {
                try {
                    // Reset chess board
                    chess.reset();
                    
                    // ✅ Create new game in database
                    const newGame = await Game.create({
                        whitePlayer: gameState.whitePlayer.id,
                        whitePlayerUsername: gameState.whitePlayer.username,
                        blackPlayer: gameState.blackPlayer.id,
                        blackPlayerUsername: gameState.blackPlayer.username
                    });
                    
                    gameState.dbGame = newGame;
                    gameState.isActive = true;
                    
                    io.emit("boardState", chess.fen());
                    io.emit("newGameStarted", "New game started!");
                    console.log(`New game requested by ${username}, DB ID: ${newGame._id}`);
                } catch (dbError) {
                    console.error("Error creating new game:", dbError);
                    socket.emit("error", "Failed to start new game");
                }
            }
        });

        // 🚪 Handle disconnection
        socket.on("disconnect", async (reason) => {
            console.log(`User disconnected: ${username} (${socket.id}) - Reason: ${reason}`);
            
            // Remove from socket mapping
            delete playerSockets[userId];
            
            // ✅ Handle game abandonment if game is active
            if (gameState.dbGame && gameState.isActive) {
                try {
                    await gameState.dbGame.completeGame(
                        'abandoned',
                        null,
                        'abandoned',
                        chess.fen()
                    );
                    console.log("Game marked as abandoned in database");
                } catch (dbError) {
                    console.error("Error marking game as abandoned:", dbError);
                }
            }
            
            // Handle player disconnection
            if (userId === players.white) {
                delete players.white;
                gameState.whitePlayer = null;
                gameState.isActive = false;
                io.emit("playerDisconnected", "White player disconnected");
                console.log("White player disconnected");
            } else if (userId === players.black) {
                delete players.black;
                gameState.blackPlayer = null;
                gameState.isActive = false;
                io.emit("playerDisconnected", "Black player disconnected");
                console.log("Black player disconnected");
            } else {
                // Remove from spectators
                gameState.spectators = gameState.spectators.filter(id => id !== userId);
            }

            // If no players left, reset the game
            if (!players.white && !players.black) {
                chess.reset();
                gameState = {
                    isActive: false,
                    whitePlayer: null,
                    blackPlayer: null,
                    spectators: [],
                    dbGame: null
                };
                console.log("Game reset - no players remaining");
            }
        });

        // 💬 Handle chat messages
        socket.on("chatMessage", (message) => {
            const chatData = {
                userId: userId,
                username: username,
                message: message,
                timestamp: new Date().toISOString()
            };
            io.emit("chatMessage", chatData);
            console.log(`Chat message from ${username}: ${message}`);
        });

    } catch (error) {
        console.error("Error in connection handler:", error);
        socket.emit("error", "Server error occurred");
    }
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Chess server listening on port ${PORT}`);
    console.log(`🔗 Access at: http://localhost:${PORT}`);
});
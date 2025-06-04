// 🔐 Check if user is logged in first
const getAuthData = () => {
    // In artifacts, we'll use window.authData instead of localStorage
    return window.authData || null;
};

const authData = getAuthData();
if (!authData || !authData.token) {
    alert("Please login to play chess!");
    // In a real app: window.location.href = "/login";
    // For artifacts: show login modal
    if (typeof showLogin === 'function') {
        showLogin();
    }
}

let socket = null;
let chess = null;
let boardElement = null;
let draggedpiece = null;
let sourceSquare = null;
let playerRole = null;

// Initialize socket connection
const initializeSocket = () => {
    const authData = getAuthData();
    if (!authData || !authData.token) {
        console.log("No authentication data available");
        return;
    }

    // 👉 Include token in the socket connection
    socket = io({
        auth: {
            token: authData.token
        }
    });

    // Store socket globally
    window.socket = socket;

    // 🛡️ Handle authentication errors
    socket.on("connect_error", (error) => {
        console.log("Connection failed:", error.message);
        alert("Authentication failed. Please login again.");
        handleAuthFailure();
    });

    socket.on("disconnect", (reason) => {
        if (reason === "io server disconnect") {
            // Server disconnected the client (likely auth issue)
            alert("Session expired. Please login again.");
            handleAuthFailure();
        }
    });

    // Connection success
    socket.on("connect", () => {
        console.log("Connected to server as authenticated user");
        updateGameStatus("Connected! Waiting for players...");
    });

    // Role assignment events from server
    socket.on("playerRole", function(role) {
        playerRole = role;
        console.log(`Assigned role: ${role === 'w' ? 'White' : 'Black'}`);
        updatePlayerRole(role);
        if (typeof renderBoard === 'function') {
            renderBoard();
        }
    });

    socket.on("spectatorRole", function() {
        playerRole = null;
        console.log("Assigned as spectator");
        alert("Game is full. You are now spectating.");
        updatePlayerRole(null);
        if (typeof renderBoard === 'function') {
            renderBoard();
        }
    });

    // Game state updates
    socket.on("boardState", function(fen) {
        if (chess) {
            chess.load(fen);
            if (typeof renderBoard === 'function') {
                renderBoard();
            }
        }
    });

    socket.on("move", function(move) {
        if (chess) {
            chess.move(move);
            if (typeof renderBoard === 'function') {
                renderBoard();
            }
        }
    });

    // Error handling
    socket.on("invalidMove", function(move) {
        console.log("Invalid move attempted:", move);
        alert("Invalid move! Please try again.");
    });

    socket.on("unauthorizedMove", function() {
        alert("It's not your turn or you can't move that piece!");
    });

    // Game events
    socket.on("gameOver", function(result) {
        alert(`Game Over! ${result}`);
    });

    socket.on("check", function() {
        alert("Check!");
    });

    // Chat events
    socket.on("chatMessage", function(data) {
        if (typeof addChatMessage === 'function') {
            addChatMessage(data);
        }
    });
};

// Handle authentication failure
const handleAuthFailure = () => {
    // Clear auth data
    window.authData = null;
    
    // Disconnect socket
    if (socket) {
        socket.disconnect();
        socket = null;
        window.socket = null;
    }
    
    // Show login modal
    if (typeof showLogin === 'function') {
        showLogin();
    }
};

// Initialize chess game
const initializeChess = () => {
    if (typeof Chess !== 'undefined') {
        chess = new Chess();
        boardElement = document.querySelector(".chessboard");
        renderBoard();
    }
};

// Render the chess board
const renderBoard = () => {
    if (!chess || !boardElement) return;
    
    const board = chess.board();
    boardElement.innerHTML = "";
    
    board.forEach((row, rowIndex) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square", 
                (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark"
            );
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = squareIndex;
            
            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === 'w' ? 'white' : 'black');
                pieceElement.innerText = getPieceUnicode(square);
                pieceElement.draggable = playerRole === square.color;
                
                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedpiece = pieceElement;
                        sourceSquare = { row: rowIndex, col: squareIndex };
                        e.dataTransfer.setData("text/plain", "");
                    }
                });
                
                pieceElement.addEventListener("dragend", () => {
                    draggedpiece = null;
                    sourceSquare = null;
                });
                
                squareElement.appendChild(pieceElement);
            }
            
            squareElement.addEventListener("dragover", (e) => {
                e.preventDefault();
            });
            
            squareElement.addEventListener("drop", function(e) {
                e.preventDefault();
                if (draggedpiece) {
                    const targetSquare = { 
                        row: parseInt(squareElement.dataset.row), 
                        col: parseInt(squareElement.dataset.col) 
                    };
                    handleMove(sourceSquare, targetSquare);
                }
            });
            
            boardElement.appendChild(squareElement);
        });
    });
    
    // Flip board for black player
    if (playerRole === 'b') {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }
};

// Handle piece moves
const handleMove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q'
    };
    
    if (socket) {
        socket.emit("move", move);
    }
};

// Get Unicode character for chess pieces
const getPieceUnicode = (piece) => {
    const unicodePieces = {
        'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
        'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟'
    };
    
    const pieceKey = piece.color + piece.type;
    return unicodePieces[pieceKey] || "";
};

// Logout function - make it globally available
const logout = () => {
    if (confirm('Are you sure you want to logout?')) {
        // Disconnect socket cleanly
        if (socket) {
            socket.disconnect();
            socket = null;
            window.socket = null;
        }
        
        // Clear authentication data
        window.authData = null;
        
        // Reset game state
        playerRole = null;
        chess = null;
        
        // Call the main logout function if available
        if (typeof window.logout === 'function') {
            // Prevent double confirmation
            window.logout = () => {
                // Actual logout logic is handled here
                if (typeof showLogin === 'function') {
                    showLogin();
                }
            };
            window.logout();
        } else if (typeof showLogin === 'function') {
            showLogin();
        }
    }
};

// Make logout function available globally
window.logout = logout;

// Auto-initialize when auth data is available
const checkAndInitialize = () => {
    const authData = getAuthData();
    if (authData && authData.token) {
        initializeChess();
        initializeSocket();
    }
};

// Initialize when document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndInitialize);
} else {
    checkAndInitialize();
}

// Export functions for global use
window.initializeSocket = initializeSocket;
window.initializeChess = initializeChess;
window.renderBoard = renderBoard;
// 🔐 Check if user is logged in first
const token = localStorage.getItem("token");
if (!token) {
    alert("Please login to play chess!");
    window.location.href = "/login"; // Redirect to login page
}

// 👉 Include token in the socket connection
const socket = io({
    auth: {
        token: token
    }
});

// 🛡️ Handle authentication errors
socket.on("connect_error", (error) => {
    console.log("Connection failed:", error.message);
    alert("Authentication failed. Please login again.");
    localStorage.removeItem("token");
    window.location.href = "/login";
    updateConnectionStatus('error');
});

socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
        // Server disconnected the client (likely auth issue)
        alert("Session expired. Please login again.");
        localStorage.removeItem("token");
        window.location.href = "/login";
    }
    updateConnectionStatus('error');
});

const chess = new Chess();
const boardElement = document.querySelector(".chessboard");
let draggedpiece = null;
let sourceSquare = null;
let playerRole = null;

const renderBoard = () => {
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

const handleMove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q'
    };
    socket.emit("move", move);
};

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
        'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟'
    };
    
    const pieceKey = piece.color + piece.type;
    return unicodePieces[pieceKey] || "";
};

// 🎯 UI Update Functions
function updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionStatus');
    const roleText = document.getElementById('roleText');
    
    if (!indicator || !roleText) return; // Safety check
    
    if (status === 'connected') {
        indicator.className = 'status-indicator connected';
        roleText.textContent = playerRole === 'w' ? 'You are White Player' : 
                              playerRole === 'b' ? 'You are Black Player' : 'Spectating';
    } else if (status === 'connecting') {
        indicator.className = 'status-indicator connecting';
        roleText.textContent = 'Connecting...';
    } else {
        indicator.className = 'status-indicator error';
        roleText.textContent = 'Connection Error';
    }
}

function updateGameState(white, black, gameReady = false) {
    const whitePlayerEl = document.getElementById('whitePlayerName');
    const blackPlayerEl = document.getElementById('blackPlayerName');
    const gameStateText = document.getElementById('gameStateText');
    const newGameBtn = document.getElementById('newGameBtn');
    
    // Safety checks
    if (whitePlayerEl) whitePlayerEl.textContent = white || 'Waiting...';
    if (blackPlayerEl) blackPlayerEl.textContent = black || 'Waiting...';
    
    if (gameStateText && newGameBtn) {
        if (gameReady && white && black) {
            gameStateText.textContent = 'Game Active - Make your move!';
            newGameBtn.disabled = false;
        } else if (white && !black) {
            gameStateText.textContent = 'Waiting for Black player...';
            newGameBtn.disabled = true;
        } else if (!white && black) {
            gameStateText.textContent = 'Waiting for White player...';
            newGameBtn.disabled = true;
        } else {
            gameStateText.textContent = 'Waiting for players...';
            newGameBtn.disabled = true;
        }
    }
}

// New game request function
function requestNewGame() {
    socket.emit("requestNewGame");
}

// 🎯 Socket Event Listeners

// Connection success
socket.on("connect", () => {
    console.log("Connected to server as authenticated user");
    updateConnectionStatus('connected');
});

// Initial connection status
updateConnectionStatus('connecting');

// Role assignment events from server
socket.on("playerRole", function(role) {
    playerRole = role;
    console.log(`Assigned role: ${role === 'w' ? 'White' : 'Black'}`);
    updateConnectionStatus('connected');
    renderBoard();
});

socket.on("spectatorRole", function() {
    playerRole = null;
    console.log("Assigned as spectator");
    alert("Game is full. You are now spectating.");
    updateConnectionStatus('connected');
    renderBoard();
});

// Game state updates
socket.on("boardState", function(fen) {
    chess.load(fen);
    renderBoard();
});

socket.on("move", function(move) {
    chess.move(move);
    renderBoard();
});

// Game ready event
socket.on("gameReady", function(data) {
    console.log("Game is ready!", data);
    updateGameState(data.whiteUsername, data.blackUsername, true);
});

// Player disconnection
socket.on("playerDisconnected", function(message) {
    console.log("Player disconnected:", message);
    updateGameState(null, null, false);
    alert(message);
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
    // Reset game state
    updateGameState(null, null, false);
});

socket.on("check", function() {
    alert("Check!");
});

socket.on("checkmate", function(winner) {
    alert(`Checkmate! ${winner} wins!`);
    updateGameState(null, null, false);
});

socket.on("stalemate", function() {
    alert("Stalemate! It's a draw.");
    updateGameState(null, null, false);
});

// Initialize board
renderBoard();
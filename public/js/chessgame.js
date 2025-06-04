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
});

socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
        // Server disconnected the client (likely auth issue)
        alert("Session expired. Please login again.");
        localStorage.removeItem("token");
        window.location.href = "/login";
    }
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

// 🎯 Socket Event Listeners

// Connection success
socket.on("connect", () => {
    console.log("Connected to server as authenticated user");
});

// Role assignment events from server
socket.on("playerRole", function(role) {
    playerRole = role;
    console.log(`Assigned role: ${role === 'w' ? 'White' : 'Black'}`);
    renderBoard();
});

socket.on("spectatorRole", function() {
    playerRole = null;
    console.log("Assigned as spectator");
    alert("Game is full. You are now spectating.");
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

// Initialize board
renderBoard();
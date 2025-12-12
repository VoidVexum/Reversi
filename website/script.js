const BOARD_SIZE = 12;
const BLACK = 'black';
const WHITE = 'white';

let state = {
    user: null,
    gameActive: false,
    board: [],
    turn: null,
    myColor: null,
    gameId: -1,
    opponent: null,
    pendingInviteId: -1
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        doLogin();
    });
    document.getElementById('btn-logout').addEventListener('click', doLogout);
    document.getElementById('btn-surrender').addEventListener('click', doSurrender);
    document.getElementById('modal-btn-yes').addEventListener('click', () => handleModalResponse(true));
    document.getElementById('modal-btn-no').addEventListener('click', () => handleModalResponse(false));
    document.getElementById('modal-btn-ok').addEventListener('click', closeModal);
    setInterval(poll, 1000);
});

function checkAuth() {
    fetch('api.php?action=check_auth')
        .then(r => r.json())
        .then(data => {
            if (data.status === 'logged_in') {
                showGame(data.user);
            } else {
                showLogin();
            }
        });
}

function doLogin() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    fetch('api.php?action=login', {
        method: 'POST',
        body: JSON.stringify({username: user, password: pass})
    })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                showGame(data.user);
            } else {
                const err = document.getElementById('login-error');
                err.innerText = data.message;
                err.style.display = 'block';
            }
        });
}

function doLogout() {
    fetch('api.php?action=logout').then(() => {
        state.user = null;
        state.gameActive = false;
        showLogin();
    });
}

function showLogin() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('game-section').style.display = 'none';
}

function showGame(user) {
    state.user = user;
    document.getElementById('current-player-name').innerText = user;
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'flex';
    loadHistory();
}

function poll() {
    if (!state.user) return;

    fetch('api.php?action=poll')
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                updateOnlineList(data.online);
                processGameState(data.game);

                if (data.invitation && state.pendingInviteId !== data.invitation.id) {
                    state.pendingInviteId = data.invitation.id;
                    showConfirmModal(
                        'Spielanfrage', 
                        `Möchtest du gegen ${data.invitation.black} spielen?`, 
                        (accepted) => {
                            respondToInvite(data.invitation.id, accepted);
                            state.pendingInviteId = -1;
                        }
                    );
                }
            }
        });
}

function updateOnlineList(users) {
    const list = document.getElementById('online-list');
    list.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="user-name">${u}</span>
            <span class="status-dot"></span>
            <button class="invite-btn" onclick="invite('${u}')">Spielen</button>
        `;
        list.appendChild(li);
    });
}

function invite(opponent) {
    fetch(`api.php?action=invite&opponent=${opponent}`);
    showAlertModal('Einladung gesendet', `Warte auf Antwort von ${opponent}...`);
}

function respondToInvite(gameId, accepted) {
    fetch('api.php?action=respond_invite', {
        method: 'POST',
        body: JSON.stringify({id: gameId, accept: accepted})
    });
}

function processGameState(game) {
    const surrenderBtn = document.getElementById('btn-surrender');

    if (!game) {
        state.gameActive = false;
        document.getElementById('board').innerHTML = '<div style="color:#aaa; padding:20px;">Kein aktives Spiel</div>';
        document.getElementById('game-status').innerText = 'Wähle einen Gegner';
        surrenderBtn.style.display = 'none';
        return;
    }

    if (game.status === 'active') {
         const modal = document.getElementById('custom-modal');
         if (modal.style.display === 'flex' && document.getElementById('modal-btn-ok').style.display !== 'none') {
             closeModal();
         }
    }

    if (game.status === 'finished') {
        if (state.gameActive) {
            state.gameActive = false;
            let msg = (game.winner === state.user) ? "Gewonnen!" : "Verloren!";
            showAlertModal('Spielende', `Spiel vorbei: ${msg}`);
            saveHistory(game.winner, game.black, game.white);
        }
        surrenderBtn.style.display = 'none';
        return;
    }

    surrenderBtn.style.display = 'inline-block';
    state.gameId = game.id;
    state.myColor = (game.black === state.user) ? BLACK : WHITE;
    state.opponent = (state.myColor === BLACK) ? game.white : game.black;
    state.turn = game.turn;

    let serverBoard = game.board;
    if (!serverBoard) {
        if (state.myColor === BLACK && !state.gameActive) {
            initBoard();
            sendUpdate();
        }
        return;
    }

    if (!state.gameActive || JSON.stringify(state.board) !== JSON.stringify(serverBoard)) {
        state.board = serverBoard;
        state.gameActive = true;
        renderBoard();
    }

    const turnMsg = (state.turn === state.myColor) ? "Du bist am Zug" : "Gegner ist am Zug";
    document.getElementById('game-status').innerText = `Gegen ${state.opponent} (${state.myColor === BLACK ? 'Schwarz' : 'Weiß'}). ${turnMsg}`;
}

function initBoard() {
    state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    const mid = BOARD_SIZE / 2;
    state.board[mid-1][mid-1] = WHITE;
    state.board[mid-1][mid]   = BLACK;
    state.board[mid][mid-1]   = BLACK;
    state.board[mid][mid]     = WHITE;
    state.turn = BLACK;
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');

            if ((r + c) % 2 === 0) cell.classList.add('light');
            else cell.classList.add('dark');

            if (state.board[r][c]) {
                const img = document.createElement('img');
                img.classList.add('disc', 'no-interp');
                img.src = state.board[r][c] === BLACK ? 'black.png' : 'white.png';
                cell.appendChild(img);
            }
            cell.onclick = () => handleClick(r, c);
            boardEl.appendChild(cell);
        }
    }
}

function handleClick(r, c) {
    if (!state.gameActive || state.turn !== state.myColor) return;
    if (state.board[r][c]) return;

    const flipped = getFlipped(r, c, state.myColor);
    if (flipped.length > 0) {
        state.board[r][c] = state.myColor;
        flipped.forEach(p => state.board[p.r][p.c] = state.myColor);
        state.turn = (state.myColor === BLACK) ? WHITE : BLACK;
        renderBoard();
        sendUpdate();
    }
}

function getFlipped(r, c, color) {
    const opp = (color === BLACK) ? WHITE : BLACK;
    const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    let all = [];

    dirs.forEach(d => {
        let dr = d[0], dc = d[1], nr = r + dr, nc = c + dc, pot = [];
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && state.board[nr][nc] === opp) {
            pot.push({r: nr, c: nc});
            nr += dr; nc += dc;
        }
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && state.board[nr][nc] === color && pot.length > 0) {
            all.push(...pot);
        }
    });
    return all;
}

function sendUpdate() {
    fetch('api.php?action=update_game', {
        method: 'POST',
        body: JSON.stringify({id: state.gameId, board: state.board, turn: state.turn})
    });
}

function doSurrender() {
    showConfirmModal("Aufgeben", "Wirklich aufgeben?", (yes) => {
        if (yes) {
            fetch(`api.php?action=surrender&id=${state.gameId}`);
        }
    });
}

// --- Modal Logic ---
let currentModalCallback = null;

function showConfirmModal(title, text, callback) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    
    document.getElementById('modal-btn-yes').style.display = 'inline-block';
    document.getElementById('modal-btn-no').style.display = 'inline-block';
    document.getElementById('modal-btn-ok').style.display = 'none';

    currentModalCallback = callback;
    document.getElementById('custom-modal').style.display = 'flex';
}

function showAlertModal(title, text) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;

    document.getElementById('modal-btn-yes').style.display = 'none';
    document.getElementById('modal-btn-no').style.display = 'none';
    document.getElementById('modal-btn-ok').style.display = 'inline-block';

    currentModalCallback = null;
    document.getElementById('custom-modal').style.display = 'flex';
}

function handleModalResponse(result) {
    if (currentModalCallback) {
        currentModalCallback(result);
    }
    closeModal();
}

function closeModal() {
    document.getElementById('custom-modal').style.display = 'none';
    currentModalCallback = null;
}

function saveHistory(winner, p1, p2) {
    let hist = JSON.parse(localStorage.getItem('rev_hist') || "[]");
    hist.unshift(`${new Date().toLocaleTimeString()} - Sieger: ${winner} (${p1} vs ${p2})`);
    localStorage.setItem('rev_hist', JSON.stringify(hist));
    loadHistory();
}

function loadHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';
    const hist = JSON.parse(localStorage.getItem('rev_hist') || "[]");
    hist.forEach(h => {
        let li = document.createElement('li');
        li.innerText = h;
        list.appendChild(li);
    });
}

function clearHistory() {
    localStorage.removeItem('rev_hist');
    loadHistory();
}
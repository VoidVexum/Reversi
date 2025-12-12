<?php
session_start();
header('Content-Type: application/json');
require_once 'config.php';

$action = $_GET['action'] ?? '';
$dataFile = 'data.json';

$response = ['status' => 'error'];

if ($action === 'login') {
    $input = json_decode(file_get_contents('php://input'), true);
    $user = $input['username'] ?? '';
    $pass = $input['password'] ?? '';

    if (isset($accounts[$user]) && $accounts[$user] === $pass) {
        $_SESSION['user'] = $user;
        $response = ['status' => 'success', 'user' => $user];
    } else {
        $response = ['status' => 'error', 'message' => 'Falscher Benutzername oder Passwort'];
    }
}
elseif ($action === 'check_auth') {
    if (isset($_SESSION['user'])) {
        $response = ['status' => 'logged_in', 'user' => $_SESSION['user']];
    } else {
        $response = ['status' => 'guest'];
    }
}
elseif ($action === 'logout') {
    session_destroy();
    $response = ['status' => 'success'];
}
elseif (isset($_SESSION['user'])) {
    $currentUser = $_SESSION['user'];

    $fp = fopen($dataFile, 'c+');
    if (flock($fp, LOCK_EX)) {
        $fsize = filesize($dataFile);
        $jsonRaw = $fsize > 0 ? fread($fp, $fsize) : '{}';
        $data = json_decode($jsonRaw, true) ?: ['users' => [], 'games' => []];

        if ($action === 'poll') {
            $data['users'][$currentUser] = time();

            $onlineUsers = [];
            foreach ($data['users'] as $u => $t) {
                if (time() - $t < 5 && $u !== $currentUser) {
                    $onlineUsers[] = $u;
                }
            }

            $activeGame = null;
            $invitation = null;

            foreach ($data['games'] as $idx => $g) {
                if ($g['black'] === $currentUser || $g['white'] === $currentUser) {
                    if ($g['status'] === 'active') {
                        $activeGame = $g;
                        $activeGame['id'] = $idx;
                        break;
                    } elseif ($g['status'] === 'finished' && !isset($g['seen_' . $currentUser])) {
                        $activeGame = $g;
                        $activeGame['id'] = $idx;
                        $data['games'][$idx]['seen_' . $currentUser] = true;
                        break;
                    } elseif ($g['status'] === 'pending' && $g['white'] === $currentUser) {
                        $invitation = $g;
                        $invitation['id'] = $idx;
                    }
                }
            }
            $response = ['status' => 'success', 'online' => $onlineUsers, 'game' => $activeGame, 'invitation' => $invitation];
        }
        elseif ($action === 'invite') {
            $opponent = $_GET['opponent'] ?? '';
            $newGame = [
                'black' => $currentUser,
                'white' => $opponent,
                'board' => null,
                'turn' => 'black',
                'status' => 'pending'
            ];
            $data['games'][] = $newGame;
            $response = ['status' => 'success'];
        }
        elseif ($action === 'respond_invite') {
            $input = json_decode(file_get_contents('php://input'), true);
            $gId = $input['id'] ?? -1;
            $accept = $input['accept'] ?? false;

            if (isset($data['games'][$gId]) && $data['games'][$gId]['status'] === 'pending') {
                if ($accept) {
                    $data['games'][$gId]['status'] = 'active';
                } else {
                    unset($data['games'][$gId]);
                    $data['games'] = array_values($data['games']);
                }
                $response = ['status' => 'success'];
            }
        }
        elseif ($action === 'update_game') {
            $input = json_decode(file_get_contents('php://input'), true);
            $gId = $input['id'] ?? -1;

            if (isset($data['games'][$gId])) {
                $data['games'][$gId]['board'] = $input['board'];
                $data['games'][$gId]['turn'] = $input['turn'];
                $response = ['status' => 'success'];
            }
        }
        elseif ($action === 'surrender') {
            $gId = $_GET['id'] ?? -1;
            if (isset($data['games'][$gId])) {
                $g = $data['games'][$gId];
                $winner = ($g['black'] === $currentUser) ? $g['white'] : $g['black'];
                $data['games'][$gId]['status'] = 'finished';
                $data['games'][$gId]['winner'] = $winner;
                $response = ['status' => 'success'];
            }
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

echo json_encode($response);

class BackgammonGame {
    constructor() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'white';
        this.dice = [0, 0];
        this.availableMoves = [];
        this.selectedChecker = null;
        this.gameState = 'waiting'; // waiting, playing, finished
        this.connection = null;
        this.isHost = false;
        this.roomId = null;
        this.socket = null;
        
        // Video chat properties
        this.localStream = null;
        this.remoteStream = null;
        this.isCameraEnabled = true;
        this.isMicEnabled = true;
        
        this.initializeUI();
        this.setupEventListeners();
        this.initializeSocket();
        this.setupVideoEventListeners();
    }

    initializeBoard() {
        const board = {
            points: {},
            bar: { white: 0, black: 0 },
            bearOff: { white: 0, black: 0 }
        };

        // Tavla başlangıç pozisyonu
        for (let i = 1; i <= 24; i++) {
            board.points[i] = [];
        }

        // Tavla başlangıç pozisyonu
        // Beyaz taşlar
        for (let i = 0; i < 2; i++) board.points[24].push('white'); // 2 taş 24'te
        for (let i = 0; i < 5; i++) board.points[13].push('white'); // 5 taş 13'te
        for (let i = 0; i < 3; i++) board.points[8].push('white');  // 3 taş 8'de
        for (let i = 0; i < 5; i++) board.points[6].push('white');  // 5 taş 6'da

        // Siyah taşlar
        for (let i = 0; i < 2; i++) board.points[1].push('black');  // 2 taş 1'de
        for (let i = 0; i < 5; i++) board.points[12].push('black'); // 5 taş 12'de
        for (let i = 0; i < 3; i++) board.points[17].push('black'); // 3 taş 17'de
        for (let i = 0; i < 5; i++) board.points[19].push('black'); // 5 taş 19'da

        return board;
    }

    initializeUI() {
        this.updateBoard();
        this.updateTurnInfo();
        this.addPointNumbers();
    }

    addPointNumbers() {
        const points = document.querySelectorAll('.point');
        points.forEach(point => {
            const pointNumber = point.getAttribute('data-point');
            const numberDiv = document.createElement('div');
            numberDiv.className = 'point-number';
            numberDiv.textContent = pointNumber;
            point.appendChild(numberDiv);
        });
    }

    setupEventListeners() {
        // Bağlantı kontrolları
        document.getElementById('create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room').addEventListener('click', () => this.joinRoom());
        document.getElementById('roll-dice').addEventListener('click', () => this.rollDice());

        // Tahta tıklama olayları
        document.querySelectorAll('.point').forEach(point => {
            point.addEventListener('click', (e) => this.handlePointClick(e));
        });

        document.getElementById('white-bar').addEventListener('click', () => this.handleBarClick('white'));
        document.getElementById('black-bar').addEventListener('click', () => this.handleBarClick('black'));
    }

    setupVideoEventListeners() {
        document.getElementById('toggle-camera').addEventListener('click', () => this.toggleCamera());
        document.getElementById('toggle-mic').addEventListener('click', () => this.toggleMicrophone());
        document.getElementById('end-call').addEventListener('click', () => this.endCall());
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Socket sunucusuna bağlandı');
        });
        
        this.socket.on('game-start', async () => {
            document.getElementById('connection-panel').style.display = 'none';
            document.getElementById('game-container').style.display = 'block';
            this.gameState = 'playing';
            this.showMessage('success', 'Oyuncu bağlandı! Oyun başlıyor...');
            
            // Start video chat
            await this.startVideoChat();
            this.setupWebRTC(this.isHost);
        });
        
        this.socket.on('webrtc-offer', (data) => {
            this.handleWebRTCOffer(data);
        });
        
        this.socket.on('webrtc-answer', (data) => {
            this.handleWebRTCAnswer(data);
        });
        
        this.socket.on('webrtc-ice-candidate', (data) => {
            this.handleICECandidate(data);
        });
        
        this.socket.on('player-disconnected', () => {
            this.showMessage('error', 'Diğer oyuncu ayrıldı');
            this.gameState = 'waiting';
        });
    }

    async createRoom() {
        document.getElementById('connection-status').textContent = 'Oda oluşturuluyor...';
        
        this.socket.emit('create-room', (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.isHost = true;
                document.getElementById('room-id').value = this.roomId;
                document.getElementById('connection-status').textContent = `Oda oluşturuldu: ${this.roomId}. Oyuncu bekleniyor...`;
            } else {
                this.showMessage('error', 'Oda oluşturulamadı');
            }
        });
    }

    async joinRoom() {
        const roomId = document.getElementById('room-id').value.trim();
        if (!roomId) {
            this.showMessage('error', 'Lütfen geçerli bir oda ID\'si girin');
            return;
        }
        
        document.getElementById('connection-status').textContent = 'Odaya bağlanılıyor...';
        
        this.socket.emit('join-room', roomId, (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.isHost = false;
                document.getElementById('connection-status').textContent = 'Odaya başarıyla katılındı!';
            } else {
                this.showMessage('error', response.error || 'Odaya katılınamadı');
                document.getElementById('connection-status').textContent = 'Bağlantı hatası';
            }
        });
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async setupWebRTC(isHost) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.connection = new RTCPeerConnection(configuration);
        this.dataChannel = null;

        if (isHost) {
            this.dataChannel = this.connection.createDataChannel('gameData');
            this.setupDataChannel(this.dataChannel);
        } else {
            this.connection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }

        // Add local stream to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.connection.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        this.connection.ontrack = (event) => {
            const [remoteStream] = event.streams;
            this.remoteStream = remoteStream;
            document.getElementById('remote-video').srcObject = remoteStream;
        };

        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', event.candidate);
            }
        };

        if (isHost) {
            const offer = await this.connection.createOffer();
            await this.connection.setLocalDescription(offer);
            this.socket.emit('webrtc-offer', offer);
        }
    }

    setupDataChannel(channel) {
        channel.onopen = () => {
            this.showMessage('success', 'P2P bağlantı kuruldu!');
            
            if (this.isHost) {
                this.startGame();
            }
        };

        channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleRemoteMessage(data);
        };

        channel.onerror = (error) => {
            this.showMessage('error', 'P2P bağlantı hatası: ' + error);
        };
    }

    async handleWebRTCOffer(offer) {
        await this.connection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);
        this.socket.emit('webrtc-answer', answer);
    }

    async handleWebRTCAnswer(answer) {
        await this.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    async handleICECandidate(candidate) {
        await this.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async startVideoChat() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: true
            });
            
            document.getElementById('local-video').srcObject = this.localStream;
            this.showMessage('success', 'Kamera ve mikrofon etkinleştirildi');
        } catch (error) {
            console.error('Video chat başlatılamadı:', error);
            this.showMessage('error', 'Kamera/mikrofon erişimi reddedildi');
        }
    }

    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isCameraEnabled = videoTrack.enabled;
                
                const button = document.getElementById('toggle-camera');
                button.classList.toggle('disabled', !this.isCameraEnabled);
                button.textContent = this.isCameraEnabled ? '📹' : '📷';
            }
        }
    }

    toggleMicrophone() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMicEnabled = audioTrack.enabled;
                
                const button = document.getElementById('toggle-mic');
                button.classList.toggle('disabled', !this.isMicEnabled);
                button.textContent = this.isMicEnabled ? '🎤' : '🔇';
            }
        }
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }
        
        document.getElementById('local-video').srcObject = null;
        document.getElementById('remote-video').srcObject = null;
        
        this.showMessage('info', 'Video chat sonlandırıldı');
    }

    sendGameData(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(data));
        }
    }

    handleRemoteMessage(data) {
        switch (data.type) {
            case 'gameState':
                this.syncGameState(data.payload);
                break;
            case 'move':
                this.handleRemoteMove(data.payload);
                break;
            case 'diceRoll':
                this.handleRemoteDiceRoll(data.payload);
                break;
            case 'turnChange':
                this.currentPlayer = data.payload.player;
                this.updateTurnInfo();
                break;
        }
    }

    startGame() {
        this.currentPlayer = 'white';
        this.gameState = 'playing';
        this.updateTurnInfo();
        this.sendGameData({
            type: 'gameState',
            payload: {
                board: this.board,
                currentPlayer: this.currentPlayer,
                gameState: this.gameState
            }
        });
    }

    rollDice() {
        if (this.gameState !== 'playing') return;
        if (this.currentPlayer !== this.getPlayerColor()) return;
        if (this.dice[0] !== 0 || this.dice[1] !== 0) return;

        this.dice = [
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1
        ];

        document.getElementById('dice1').textContent = this.dice[0];
        document.getElementById('dice2').textContent = this.dice[1];

        this.availableMoves = this.calculateAvailableMoves();
        
        this.sendGameData({
            type: 'diceRoll',
            payload: {
                dice: this.dice,
                player: this.currentPlayer
            }
        });

        if (this.availableMoves.length === 0) {
            setTimeout(() => {
                this.endTurn();
            }, 2000);
        }
    }

    handleRemoteDiceRoll(data) {
        this.dice = data.dice;
        document.getElementById('dice1').textContent = this.dice[0];
        document.getElementById('dice2').textContent = this.dice[1];
        this.availableMoves = this.calculateAvailableMoves();
    }

    getPlayerColor() {
        return this.isHost ? 'white' : 'black';
    }

    calculateAvailableMoves() {
        const moves = [];
        const player = this.currentPlayer;
        const diceValues = this.dice[0] === this.dice[1] ? 
            [this.dice[0], this.dice[0], this.dice[0], this.dice[0]] : 
            [...this.dice];

        // Bar'dan taş varsa önce oradan oyna
        if (this.board.bar[player] > 0) {
            diceValues.forEach((diceValue, index) => {
                const targetPoint = player === 'white' ? 25 - diceValue : diceValue;
                if (this.canMoveToPoint(targetPoint, player)) {
                    moves.push({
                        from: 'bar',
                        to: targetPoint,
                        diceIndex: index,
                        diceValue: diceValue
                    });
                }
            });
        } else {
            // Normal hamleleri hesapla
            for (let point = 1; point <= 24; point++) {
                const checkers = this.board.points[point];
                if (checkers.length > 0 && checkers[checkers.length - 1] === player) {
                    diceValues.forEach((diceValue, index) => {
                        const targetPoint = player === 'white' ? 
                            point - diceValue : point + diceValue;
                        
                        if (targetPoint < 1 || targetPoint > 24) {
                            // Bear off kontrolü
                            if (this.canBearOff(player) && 
                                ((player === 'white' && targetPoint < 1) || 
                                 (player === 'black' && targetPoint > 24))) {
                                moves.push({
                                    from: point,
                                    to: 'bearoff',
                                    diceIndex: index,
                                    diceValue: diceValue
                                });
                            }
                        } else if (this.canMoveToPoint(targetPoint, player)) {
                            moves.push({
                                from: point,
                                to: targetPoint,
                                diceIndex: index,
                                diceValue: diceValue
                            });
                        }
                    });
                }
            }
        }

        return moves;
    }

    canMoveToPoint(point, player) {
        const checkers = this.board.points[point];
        if (!checkers || checkers.length === 0) return true;
        if (checkers[0] === player) return true;
        return checkers.length === 1; // Tek rakip taşı varsa vurulabilir
    }

    canBearOff(player) {
        // Tüm taşlar home board'da mı kontrol et
        const homeStart = player === 'white' ? 1 : 19;
        const homeEnd = player === 'white' ? 6 : 24;
        
        if (this.board.bar[player] > 0) return false;
        
        for (let point = 1; point <= 24; point++) {
            if (point < homeStart || point > homeEnd) {
                const checkers = this.board.points[point];
                if (checkers.length > 0 && checkers[checkers.length - 1] === player) {
                    return false;
                }
            }
        }
        
        return true;
    }

    handlePointClick(event) {
        const point = parseInt(event.currentTarget.getAttribute('data-point'));
        const checkers = this.board.points[point];
        
        if (this.currentPlayer !== this.getPlayerColor()) return;
        if (this.gameState !== 'playing') return;
        if (this.dice[0] === 0 && this.dice[1] === 0) return;

        // Taş seçimi
        if (!this.selectedChecker && checkers.length > 0 && 
            checkers[checkers.length - 1] === this.currentPlayer) {
            this.selectedChecker = { from: point, type: 'point' };
            this.highlightValidMoves();
            return;
        }

        // Hamle yapma
        if (this.selectedChecker) {
            const move = this.availableMoves.find(m => 
                m.from === this.selectedChecker.from && m.to === point);
            
            if (move) {
                this.makeMove(move);
            }
            
            this.clearSelection();
        }
    }

    handleBarClick(color) {
        if (this.currentPlayer !== this.getPlayerColor()) return;
        if (this.gameState !== 'playing') return;
        if (this.board.bar[color] === 0) return;
        if (color !== this.currentPlayer) return;

        this.selectedChecker = { from: 'bar', type: 'bar', color: color };
        this.highlightValidMoves();
    }

    highlightValidMoves() {
        this.clearHighlights();
        
        if (!this.selectedChecker) return;
        
        const validMoves = this.availableMoves.filter(move => 
            move.from === this.selectedChecker.from);
        
        validMoves.forEach(move => {
            if (move.to === 'bearoff') {
                const bearOffElement = document.getElementById(
                    `${this.currentPlayer}-bear-off`);
                bearOffElement.classList.add('valid-destination');
            } else {
                const pointElement = document.querySelector(
                    `[data-point="${move.to}"]`);
                if (pointElement) {
                    pointElement.classList.add('valid-destination');
                }
            }
        });
    }

    clearHighlights() {
        document.querySelectorAll('.valid-destination').forEach(el => {
            el.classList.remove('valid-destination');
        });
        document.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });
    }

    clearSelection() {
        this.selectedChecker = null;
        this.clearHighlights();
    }

    makeMove(move) {
        // Hamleyi uygula
        if (move.from === 'bar') {
            this.board.bar[this.currentPlayer]--;
        } else {
            this.board.points[move.from].pop();
        }

        if (move.to === 'bearoff') {
            this.board.bearOff[this.currentPlayer]++;
        } else {
            // Rakip taşını vur
            const targetCheckers = this.board.points[move.to];
            if (targetCheckers.length === 1 && targetCheckers[0] !== this.currentPlayer) {
                const opponent = targetCheckers[0];
                this.board.points[move.to] = [];
                this.board.bar[opponent]++;
            }
            
            this.board.points[move.to].push(this.currentPlayer);
        }

        // Zarı kullan
        this.dice[move.diceIndex] = 0;
        this.availableMoves = this.calculateAvailableMoves();
        
        // UI'yi güncelle
        this.updateBoard();
        document.getElementById('dice1').textContent = this.dice[0] || '-';
        document.getElementById('dice2').textContent = this.dice[1] || '-';

        // Hamleyi karşı tarafa gönder
        this.sendGameData({
            type: 'move',
            payload: {
                move: move,
                board: this.board,
                dice: this.dice
            }
        });

        // Kazanma kontrolü
        if (this.checkWin()) {
            this.endGame();
            return;
        }

        // Tüm zarlar kullanıldıysa veya hamle kalmadıysa turu bitir
        if ((this.dice[0] === 0 && this.dice[1] === 0) || this.availableMoves.length === 0) {
            this.endTurn();
        }
    }

    handleRemoteMove(data) {
        this.board = data.board;
        this.dice = data.dice;
        this.updateBoard();
        document.getElementById('dice1').textContent = this.dice[0] || '-';
        document.getElementById('dice2').textContent = this.dice[1] || '-';
        this.availableMoves = this.calculateAvailableMoves();
    }

    checkWin() {
        return this.board.bearOff[this.currentPlayer] === 15;
    }

    endGame() {
        this.gameState = 'finished';
        this.showMessage('success', 
            `${this.currentPlayer === this.getPlayerColor() ? 'Kazandınız!' : 'Kaybettiniz!'}`);
    }

    endTurn() {
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.dice = [0, 0];
        this.availableMoves = [];
        this.clearSelection();
        
        document.getElementById('dice1').textContent = '-';
        document.getElementById('dice2').textContent = '-';
        
        this.updateTurnInfo();
        
        this.sendGameData({
            type: 'turnChange',
            payload: {
                player: this.currentPlayer
            }
        });
    }

    updateBoard() {
        // Tüm puan noktalarını temizle
        document.querySelectorAll('.point').forEach(point => {
            const checkers = point.querySelectorAll('.checker');
            checkers.forEach(checker => checker.remove());
        });

        // Taşları yerleştir
        for (let pointNum = 1; pointNum <= 24; pointNum++) {
            const checkers = this.board.points[pointNum];
            const pointElement = document.querySelector(`[data-point="${pointNum}"]`);
            
            checkers.forEach((color, index) => {
                const checker = document.createElement('div');
                checker.className = `checker ${color}`;
                checker.style.position = 'absolute';
                
                // Taş pozisyonunu hesapla
                const isTopSection = pointNum > 12;
                if (isTopSection) {
                    checker.style.top = (index * 25) + 'px';
                } else {
                    checker.style.bottom = (index * 25) + 'px';
                }
                
                if (index >= 5) {
                    checker.textContent = checkers.length;
                    checker.style.zIndex = '10';
                }
                
                pointElement.appendChild(checker);
            });
        }

        // Bar'daki taşları güncelle
        this.updateBar();
        this.updateBearOff();
    }

    updateBar() {
        const whiteBar = document.getElementById('white-bar');
        const blackBar = document.getElementById('black-bar');
        
        whiteBar.innerHTML = '';
        blackBar.innerHTML = '';

        // Beyaz taşlar
        for (let i = 0; i < this.board.bar.white; i++) {
            const checker = document.createElement('div');
            checker.className = 'checker white';
            checker.textContent = i === 0 && this.board.bar.white > 1 ? this.board.bar.white : '';
            whiteBar.appendChild(checker);
        }

        // Siyah taşlar
        for (let i = 0; i < this.board.bar.black; i++) {
            const checker = document.createElement('div');
            checker.className = 'checker black';
            checker.textContent = i === 0 && this.board.bar.black > 1 ? this.board.bar.black : '';
            blackBar.appendChild(checker);
        }
    }

    updateBearOff() {
        const whiteBearOff = document.getElementById('white-bear-off');
        const blackBearOff = document.getElementById('black-bear-off');
        
        whiteBearOff.innerHTML = `Beyaz Çıkarma<br>${this.board.bearOff.white}/15`;
        blackBearOff.innerHTML = `Siyah Çıkarma<br>${this.board.bearOff.black}/15`;
    }

    updateTurnInfo() {
        const turnInfo = document.getElementById('current-turn');
        const playerName = this.currentPlayer === 'white' ? 'Beyaz' : 'Siyah';
        const isMyTurn = this.currentPlayer === this.getPlayerColor();
        
        if (isMyTurn) {
            turnInfo.textContent = `Sizin sıranız - Zar atın!`;
        } else {
            turnInfo.textContent = `Rakip bekleniyor...`;
        }
        
        const rollButton = document.getElementById('roll-dice');
        rollButton.disabled = !isMyTurn || this.gameState !== 'playing';
        rollButton.style.display = isMyTurn ? 'block' : 'none';
        
        // Zar konteynerini de gizle/göster
        const diceContainer = document.getElementById('dice-container');
        if (!isMyTurn) {
            diceContainer.style.opacity = '0.5';
        } else {
            diceContainer.style.opacity = '1';
        }
    }

    syncGameState(data) {
        this.board = data.board;
        this.currentPlayer = data.currentPlayer;
        this.gameState = data.gameState;
        this.updateBoard();
        this.updateTurnInfo();
    }

    showMessage(type, text) {
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        
        document.getElementById('app').insertBefore(message, document.getElementById('app').firstChild);
        
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 5000);
    }
}

// Oyunu başlat
document.addEventListener('DOMContentLoaded', () => {
    window.game = new BackgammonGame();
});
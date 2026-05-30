/**
 * Jotanoid - Arkanoid Retro Neon
 * Pure JavaScript & Canvas Game Engine
 */

// --- Audio Synthesizer Class (Web Audio API) ---
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTone(freq, type, duration, endFreq = null) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
      }
      
      gainNode.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio failed to play silently
    }
  }

  wall() {
    this.playTone(320, 'triangle', 0.08);
  }

  paddle() {
    this.playTone(400, 'triangle', 0.12, 600);
  }

  brick() {
    this.playTone(220, 'sawtooth', 0.08, 90);
  }

  shield() {
    this.playTone(349.2, 'sine', 0.06, 523.25); // F4 -> C5 chime
  }

  reinforcedShield() {
    this.playTone(293.66, 'sawtooth', 0.07, 440); // D4 -> A4 metallic impact
  }

  powerup() {
    this.playTone(330, 'sine', 0.15, 660); // rising chime
  }

  laser() {
    this.playTone(587.33, 'sawtooth', 0.06, 220); // D5 -> A3 laser shot
  }

  lifeLost() {
    this.playTone(180, 'sawtooth', 0.4, 40);
  }

  gameOver() {
    if (!this.ctx) return;
    this.playTone(180, 'sawtooth', 0.25);
    setTimeout(() => this.playTone(140, 'sawtooth', 0.25), 200);
    setTimeout(() => this.playTone(110, 'sawtooth', 0.5, 50), 400);
  }

  victory() {
    if (!this.ctx) return;
    this.playTone(261.6, 'sine', 0.12); // C4
    setTimeout(() => this.playTone(329.6, 'sine', 0.12), 120); // E4
    setTimeout(() => this.playTone(392.0, 'sine', 0.12), 240); // G4
    setTimeout(() => this.playTone(523.3, 'sine', 0.35, 783.99), 360); // C5 -> G5
  }
}

const sounds = new SoundEffects();
let scoreMultiplier = 1;

// --- Particle System ---
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = Math.random() * 3 + 2;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.alpha = 1;
    this.decay = Math.random() * 0.02 + 0.015;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.06; // Subtle gravity
    this.alpha -= this.decay;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Floating Score Popups ---
class ScorePopup {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.alpha = 1;
    this.vy = -1;
  }

  update() {
    this.y += this.vy;
    this.alpha -= 0.025;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.font = '600 13px "Outfit"';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 4;
    ctx.shadowColor = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// --- Main Game Engine ---
const game = {
  // DOM Elements
  canvas: document.getElementById('gameCanvas'),
  ctx: null,
  
  hud: document.getElementById('hud'),
  scoreVal: document.getElementById('score-val'),
  levelVal: document.getElementById('level-val'),
  comboVal: document.getElementById('combo-val'),
  livesIcons: document.getElementById('lives-icons'),

  // Overlays
  menuStart: document.getElementById('menu-start'),
  menuGameOver: document.getElementById('menu-gameover'),
  menuVictory: document.getElementById('menu-victory'),
  menuPause: document.getElementById('menu-pause'),
  menuNameInput: document.getElementById('menu-name-input'),
  menuLeaderboard: document.getElementById('menu-leaderboard'),

  // Buttons
  btnStart: document.getElementById('btn-start'),
  btnGameOverRestart: document.getElementById('btn-gameover-restart'),
  btnVictoryRestart: document.getElementById('btn-victory-restart'),
  btnPauseResume: document.getElementById('btn-pause-resume'),
  btnPauseMenu: document.getElementById('btn-pause-menu'),
  btnSubmitName: document.getElementById('btn-submit-name'),
  btnViewLeaderboard: document.getElementById('btn-view-leaderboard'),
  btnLeaderboardBack: document.getElementById('btn-leaderboard-back'),
  btnCloseName: document.getElementById('btn-close-name'),
  
  // Input and name elements
  playerNameInput: document.getElementById('player-name-input'),
  welcomeName: document.getElementById('welcome-name'),
  leaderboardBody: document.getElementById('leaderboard-body'),

  // Game States: 'START', 'PLAYING', 'PAUSED', 'LEVEL_COMPLETE', 'GAMEOVER', 'VICTORY'
  state: 'START',
  difficulty: 'medium',

  // Gameplay Settings per Difficulty (baseline modifiers)
  difficultyConfig: {
    easy: {
      paddleWidth: 135,
      speedMultiplier: 0.85,
      speedIncrease: 0.04
    },
    medium: {
      paddleWidth: 110,
      speedMultiplier: 1.0,
      speedIncrease: 0.06
    },
    hard: {
      paddleWidth: 85,
      speedMultiplier: 1.15,
      speedIncrease: 0.08
    }
  },

  // Progressive configurations for the 5 levels
  levelConfig: {
    1: {
      baseSpeed: 4.2,
      paddleWidthFactor: 1.1
    },
    2: {
      baseSpeed: 5.0,
      paddleWidthFactor: 1.0
    },
    3: {
      baseSpeed: 5.8,
      paddleWidthFactor: 0.95
    },
    4: {
      baseSpeed: 6.6,
      paddleWidthFactor: 0.9
    },
    5: {
      baseSpeed: 7.5,
      paddleWidthFactor: 0.85
    }
  },

  // Game variables
  playerName: 'Jogador',
  score: 0,
  lives: 3,
  scoreMultiplier: 1,
  currentLevel: 1,
  ballBaseSpeed: 6.2,
  blocksDestroyed: 0,
  totalBlocks: 0,
  
  // Screenshake and Flash effects variables
  shakeDuration: 0,
  shakeIntensity: 0,
  shakeX: 0,
  shakeY: 0,
  paddleFlashTimer: 0,

  paddle: {
    x: 0,
    y: 540,
    width: 110,
    height: 14,
    speed: 10,
    color: '#00f3ff',
    expandedTimer: 0,
    laserTimer: 0,
    laserCooldown: 0
  },

  // Active timers
  fireballTimer: 0,

  // Supports multiple active balls and lasers
  balls: [],
  lasers: [],
  
  powerups: [],
  particles: [],
  popups: [],

  // Initialize game
  init() {
    this.ctx = this.canvas.getContext('2d');
    
    // Bind Event Listeners
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('click', () => this.handleCanvasClick());
    
    // Touch Event Listeners for Mobile controls
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    
    // UI Event Listeners
    this.btnStart.addEventListener('click', () => this.promptPlayerName());
    this.btnGameOverRestart.addEventListener('click', () => this.restartGame());
    this.btnVictoryRestart.addEventListener('click', () => this.restartGame());
    this.btnPauseResume.addEventListener('click', () => this.togglePause());
    this.btnPauseMenu.addEventListener('click', () => this.returnToMainMenu());
    this.btnSubmitName.addEventListener('click', () => this.startGame());
    this.playerNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.startGame(); });
    this.btnViewLeaderboard.addEventListener('click', () => this.showLeaderboard());
    this.btnLeaderboardBack.addEventListener('click', () => this.hideLeaderboard());
    this.btnCloseName.addEventListener('click', () => this.cancelNameInput());

    // Responsive Canvas aspect ratio setup
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Reset initial states
    this.setDifficulty('medium');
    this.resetGameState();
    
    // Start animation loop
    this.loop();
  },

  // Resize canvas properly in standard viewports
  resizeCanvas() {
    const container = this.canvas.parentElement;
    const aspect = 800 / 600;
    let width = container.clientWidth;
    let height = container.clientHeight;

    if (width / height > aspect) {
      width = height * aspect;
    } else {
      height = width / aspect;
    }
  },

  setDifficulty(diff) {
    this.difficulty = diff;
    
    const baseCfg = this.difficultyConfig[diff];
    const lvlCfg = this.levelConfig[this.currentLevel] || this.levelConfig[1];
    
    // Keep expanded paddle size if powerup active, otherwise apply standard
    if (this.paddle.expandedTimer <= 0) {
      this.paddle.width = baseCfg.paddleWidth * lvlCfg.paddleWidthFactor;
    }
  },

  // Reset complete state for a brand new game
  resetGameState() {
    this.score = 0;
    this.lives = 3;
    this.currentLevel = 1;
    this.paddle.expandedTimer = 0;
    this.paddle.laserTimer = 0;
    this.fireballTimer = 0;
    this.loadLevel(1);
  },

  // Load configuration and schematic for specific level
  loadLevel(levelNum) {
    this.currentLevel = levelNum;
    this.blocksDestroyed = 0;
    this.particles = [];
    this.popups = [];
    this.powerups = [];
    this.lasers = [];

    // Reset active powerup statuses
    this.paddle.expandedTimer = 0;
    this.paddle.laserTimer = 0;
    this.fireballTimer = 0;

    const baseCfg = this.difficultyConfig[this.difficulty];
    const lvlCfg = this.levelConfig[levelNum];

    // Compute ball speed and paddle width pro-rated on active difficulty
    this.ballBaseSpeed = lvlCfg.baseSpeed * baseCfg.speedMultiplier;
    this.paddle.width = baseCfg.paddleWidth * lvlCfg.paddleWidthFactor;
    this.paddle.x = (this.canvas.width - this.paddle.width) / 2;

    this.resetBall();
    this.generateBricks();
    this.updateHUD();
  },

  resetBall() {
    this.balls = [{
      x: this.paddle.x + this.paddle.width / 2,
      y: this.paddle.y - 7.5 - 2,
      radius: 7.5,
      dx: 0,
      dy: 0,
      baseSpeed: this.ballBaseSpeed,
      currentSpeed: this.ballBaseSpeed,
      attached: true,
      color: '#ff007f',
      trail: []
    }];

    scoreMultiplier = 1;
  },

  // Spawn a second ball for the Multi-Ball powerup
  spawnExtraBall() {
    const templateBall = this.balls[0] || {
      x: this.paddle.x + this.paddle.width / 2,
      y: this.paddle.y - 20,
      radius: 7.5,
      currentSpeed: this.ballBaseSpeed,
      baseSpeed: this.ballBaseSpeed
    };

    const angle = (Math.random() * 0.3 + 0.35) * Math.PI; // upward vector
    const direction = Math.random() < 0.5 ? -1 : 1;

    this.balls.push({
      x: templateBall.x,
      y: templateBall.y,
      radius: templateBall.radius,
      dx: Math.cos(angle) * templateBall.currentSpeed * direction,
      dy: -Math.sin(angle) * templateBall.currentSpeed,
      baseSpeed: templateBall.baseSpeed,
      currentSpeed: templateBall.currentSpeed,
      attached: false,
      color: '#00f3ff', // Cyan-blue extra ball
      trail: []
    });

    sounds.playTone(450, 'sine', 0.08, 600);
  },

  fireLasers() {
    this.paddle.laserCooldown = 0.35; // 350ms firing cooldown
    
    // Spawn left & right beams
    this.lasers.push({
      x: this.paddle.x + 8,
      y: this.paddle.y - 12,
      width: 3.5,
      height: 12,
      vy: -7.5
    });

    this.lasers.push({
      x: this.paddle.x + this.paddle.width - 8,
      y: this.paddle.y - 12,
      width: 3.5,
      height: 12,
      vy: -7.5
    });

    sounds.laser();
  },

  // Generate layouts for standard, resistant and compact levels
  generateBricks() {
    this.bricks = [];
    const cols = 10;
    
    const brickSpacing = 8;
    const topMargin = 96;
    const horizontalMargin = 44;
    const brickWidth = 64;
    const brickHeight = 18;

    const rowColors = [
      '#ff0055', // Red
      '#ff5500', // Orange
      '#ffaa00', // Yellow-orange
      '#ffea00', // Yellow
      '#00ff66', // Green
      '#00f3ff', // Cyan
      '#0066ff', // Blue
      '#9d00ff'  // Purple
    ];

    let schematic = [];

    if (this.currentLevel === 1) {
      // Nível 1: 3 linhas simples
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        schematic.push(Array(cols).fill(1));
      }
    } else if (this.currentLevel === 2) {
      // Nível 2: 4 linhas intercalando
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        let rowData = [];
        for (let c = 0; c < cols; c++) {
          const isResistant = (r + c) % 2 === 0;
          rowData.push(isResistant ? 2 : 1);
        }
        schematic.push(rowData);
      }
    } else if (this.currentLevel === 3) {
      // Nível 3: V / Inverted pyramid com Metal (4) e Surpresa (5)
      schematic = [
        [4, 2, 2, 2, 2, 2, 2, 2, 2, 4],
        [0, 4, 2, 2, 2, 2, 2, 2, 4, 0],
        [0, 0, 1, 1, 5, 5, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0]
      ];
    } else if (this.currentLevel === 4) {
      // Nível 4: 5 linhas complexas com Metal (4) e Surpresa (5)
      schematic = [
        [3, 3, 4, 3, 3, 3, 3, 4, 3, 3],
        [2, 1, 5, 2, 1, 1, 2, 5, 1, 2],
        [1, 4, 2, 1, 2, 2, 1, 2, 4, 1],
        [2, 1, 2, 4, 5, 5, 4, 2, 1, 2],
        [1, 2, 1, 1, 2, 2, 1, 1, 2, 1]
      ];
    } else if (this.currentLevel === 5) {
      // Nível 5: Labirinto final com Metal (4) como barreiras e Surpresas (5) em alcovas
      schematic = [
        [4, 5, 4, 2, 2, 2, 2, 4, 5, 4],
        [4, 0, 4, 0, 3, 3, 0, 4, 0, 4],
        [2, 0, 4, 0, 2, 2, 0, 4, 0, 2],
        [1, 0, 4, 4, 5, 5, 4, 4, 0, 1],
        [2, 2, 0, 0, 3, 3, 0, 0, 2, 2],
        [0, 0, 4, 0, 0, 0, 0, 4, 0, 0],
        [1, 1, 4, 1, 1, 1, 1, 4, 1, 1]
      ];
    }

    // Assemble bricks from schematic
    let total = 0;
    for (let r = 0; r < schematic.length; r++) {
      const color = rowColors[r % rowColors.length];
      const points = (schematic.length - r) * 10;
      
      for (let c = 0; c < cols; c++) {
        const brickType = schematic[r][c];
        if (brickType === 0) continue;

        const x = horizontalMargin + c * (brickWidth + brickSpacing);
        const y = topMargin + r * (brickHeight + brickSpacing);
        
        const isMetal = brickType === 4;
        const isSurprise = brickType === 5;

        this.bricks.push({
          x: x,
          y: y,
          width: brickWidth,
          height: brickHeight,
          color: isMetal ? '#7a8296' : (isSurprise ? '#9d00ff' : color),
          points: isMetal ? 150 : (isSurprise ? 100 : points),
          hitsLeft: isMetal ? 999 : (isSurprise ? 1 : brickType),
          maxHits: isMetal ? 999 : (isSurprise ? 1 : brickType),
          active: true,
          isMetal: isMetal,
          isSurprise: isSurprise
        });
        if (!isMetal) {
          total++;
        }
      }
    }
    this.totalBlocks = total;
  },

  // Keyboard Event Handlers
  handleKeyDown(e) {
    // Space trigger: Launch ball or Fire lasers
    if (e.code === 'Space') {
      if (this.state === 'PLAYING') {
        const hasAttached = this.balls.some(b => b.attached);
        if (hasAttached) {
          this.launchBall();
        } else if (this.paddle.laserTimer > 0 && this.paddle.laserCooldown <= 0) {
          this.fireLasers();
        }
      }
      e.preventDefault();
    }

    // Pause key (P or Escape)
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.state === 'PLAYING' || this.state === 'PAUSED') {
        this.togglePause();
      }
      e.preventDefault();
    }
  },

  // Mouse Movement Handler
  handleMouseMove(e) {
    if (this.state !== 'PLAYING') return;
    
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    
    this.paddle.x = mouseX - this.paddle.width / 2;
    
    if (this.paddle.x < 0) {
      this.paddle.x = 0;
    } else if (this.paddle.x > this.canvas.width - this.paddle.width) {
      this.paddle.x = this.canvas.width - this.paddle.width;
    }
    
    // Move any attached balls horizontally with the paddle
    this.balls.forEach(b => {
      if (b.attached) {
        b.x = this.paddle.x + this.paddle.width / 2;
      }
    });
  },

  handleTouchStart(e) {
    if (this.state !== 'PLAYING') return;
    if (e.touches.length === 0) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const touchX = (e.touches[0].clientX - rect.left) * scaleX;
    
    // Tap triggers ball launch or laser firing
    const hasAttached = this.balls.some(b => b.attached);
    if (hasAttached) {
      this.launchBall();
    } else if (this.paddle.laserTimer > 0 && this.paddle.laserCooldown <= 0) {
      this.fireLasers();
    }
    
    this.movePaddleToX(touchX);
    
    e.preventDefault();
    e.stopPropagation();
  },

  handleTouchMove(e) {
    if (this.state !== 'PLAYING') return;
    if (e.touches.length === 0) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const touchX = (e.touches[0].clientX - rect.left) * scaleX;
    
    this.movePaddleToX(touchX);
    
    e.preventDefault();
    e.stopPropagation();
  },

  movePaddleToX(touchX) {
    this.paddle.x = touchX - this.paddle.width / 2;
    
    if (this.paddle.x < 0) {
      this.paddle.x = 0;
    } else if (this.paddle.x > this.canvas.width - this.paddle.width) {
      this.paddle.x = this.canvas.width - this.paddle.width;
    }
    
    // Move any attached balls horizontally with the paddle
    this.balls.forEach(b => {
      if (b.attached) {
        b.x = this.paddle.x + this.paddle.width / 2;
      }
    });
  },

  handleCanvasClick() {
    if (this.state === 'PLAYING') {
      const hasAttached = this.balls.some(b => b.attached);
      if (hasAttached) {
        this.launchBall();
      } else if (this.paddle.laserTimer > 0 && this.paddle.laserCooldown <= 0) {
        this.fireLasers();
      }
    }
  },

  launchBall() {
    this.balls.forEach(b => {
      if (b.attached) {
        b.attached = false;
        const angle = (Math.random() * 0.3 + 0.35) * Math.PI;
        const direction = Math.random() < 0.5 ? -1 : 1;
        
        b.dx = Math.cos(angle) * b.currentSpeed * direction;
        b.dy = -Math.sin(angle) * b.currentSpeed;
        
        sounds.init();
        sounds.paddle();
      }
    });
  },

  triggerScreenshake(duration, intensity) {
    this.shakeDuration = duration;
    this.shakeIntensity = intensity;
  },

  promptPlayerName() {
    this.menuStart.classList.add('hidden');
    this.menuNameInput.classList.remove('hidden');
    this.playerNameInput.value = '';
    this.playerNameInput.focus();
    
    sounds.init();
    sounds.playTone(330, 'sine', 0.1, 550);
  },

  cancelNameInput() {
    this.menuNameInput.classList.add('hidden');
    this.menuStart.classList.remove('hidden');
    
    sounds.init();
    sounds.playTone(220, 'sine', 0.1, 110);
  },

  showLeaderboard() {
    this.menuStart.classList.add('hidden');
    this.menuLeaderboard.classList.remove('hidden');
    this.renderLeaderboard();
    
    sounds.init();
    sounds.playTone(330, 'sine', 0.1, 440);
  },

  hideLeaderboard() {
    this.menuLeaderboard.classList.add('hidden');
    this.menuStart.classList.remove('hidden');
    
    sounds.init();
    sounds.playTone(220, 'sine', 0.1, 110);
  },

  getLeaderboard() {
    const raw = localStorage.getItem('jotanoid_leaderboard_clean');
    if (raw) {
      try {
        let list = JSON.parse(raw);
        if (Array.isArray(list)) {
          // Remove qualquer bot antigo residual que possa ter sido salvo
          list = list.filter(item => !item.name.startsWith('Bot_'));
          return list.sort((a, b) => b.score - a.score);
        }
      } catch (e) {
        // Ignora erros de parsing
      }
    }
    return [];
  },

  renderLeaderboard() {
    const list = this.getLeaderboard();
    let html = '';
    if (list.length === 0) {
      html = `
        <tr>
          <td colspan="3" style="text-align: center; color: rgba(255, 255, 255, 0.35); padding: 18px 0; font-style: italic;">
            Nenhum recorde registrado
          </td>
        </tr>
      `;
    } else {
      list.forEach((item, idx) => {
        const isTop = idx === 0 ? 'rank-1' : '';
        html += `
          <tr class="${isTop}">
            <td style="text-align: center;"><span class="rank-num">${idx + 1}</span></td>
            <td><span class="rank-name">${item.name}</span></td>
            <td style="text-align: right;"><span class="rank-score">${this.formatScore(item.score)}</span></td>
          </tr>
        `;
      });
    }
    this.leaderboardBody.innerHTML = html;
  },

  checkAndSaveScore(finalScore) {
    let list = this.getLeaderboard();
    list.push({ name: this.playerName, score: finalScore });
    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, 5);
    localStorage.setItem('jotanoid_leaderboard_clean', JSON.stringify(list));
  },

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.menuPause.classList.remove('hidden');
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.menuPause.classList.add('hidden');
    }
  },

  returnToMainMenu() {
    // 1. Interrompa o loop do Canvas (cancelAnimationFrame)
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 2. Resete todas as variáveis do jogo para o estado inicial
    this.score = 0;
    this.lives = 3;
    this.currentLevel = 1;

    // 3. Limpe os arrays de partículas, lasers e power-ups que possam estar ativos
    this.particles = [];
    this.lasers = [];
    this.powerups = [];
    this.balls = [];
    this.popups = [];

    // Reset paddle/powerup timers
    this.paddle.expandedTimer = 0;
    this.paddle.laserTimer = 0;
    this.paddle.laserCooldown = 0;
    this.fireballTimer = 0;

    // Redefine velocidade base e largura da barra com base na configuração do Nível 1
    const baseCfg = this.difficultyConfig[this.difficulty];
    const lvlCfg = this.levelConfig[1];
    this.ballBaseSpeed = lvlCfg.baseSpeed * baseCfg.speedMultiplier;
    this.paddle.width = baseCfg.paddleWidth * lvlCfg.paddleWidthFactor;
    this.paddle.x = (this.canvas.width - this.paddle.width) / 2;

    this.resetBall();
    this.generateBricks();
    this.updateHUD();

    // 4. Esconda a tela de jogo/pausa e exiba novamente a tela do Menu Inicial
    this.state = 'START';
    this.menuStart.classList.remove('hidden');
    this.menuPause.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.menuGameOver.classList.add('hidden');
    this.menuVictory.classList.add('hidden');

    // Atualiza a tela estática uma vez
    this.draw();
  },

  startGame() {
    // Captura o nome inserido ou usa o padrão
    const enteredName = this.playerNameInput.value.trim();
    this.playerName = enteredName || 'Jogador';
    if (this.welcomeName) {
      this.welcomeName.textContent = this.playerName;
    }

    sounds.init();
    sounds.playTone(300, 'triangle', 0.15, 600);
    
    this.state = 'PLAYING';
    this.setDifficulty(this.difficulty);
    this.resetGameState();
    
    this.menuNameInput.classList.add('hidden');
    this.menuStart.classList.add('hidden');
    this.hud.classList.remove('hidden');

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.loop();
  },

  restartGame() {
    sounds.init();
    sounds.playTone(300, 'triangle', 0.15, 600);
    
    this.state = 'PLAYING';
    this.resetGameState();
    
    this.menuGameOver.classList.add('hidden');
    this.menuVictory.classList.add('hidden');
    this.hud.classList.remove('hidden');

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.loop();
  },

  // Trigger phase progression
  triggerLevelComplete() {
    this.state = 'LEVEL_COMPLETE';
    sounds.playTone(261.6, 'sine', 0.1);
    setTimeout(() => sounds.playTone(329.6, 'sine', 0.1), 100);
    setTimeout(() => sounds.playTone(392.0, 'sine', 0.25, 523.25), 200);

    setTimeout(() => {
      if (this.currentLevel < 5) {
        this.loadLevel(this.currentLevel + 1);
        this.state = 'PLAYING';
      } else {
        this.triggerVictory();
      }
    }, 2000);
  },

  triggerGameOver() {
    this.state = 'GAMEOVER';
    sounds.gameOver();
    
    this.checkAndSaveScore(this.score);
    
    document.getElementById('go-score').textContent = this.formatScore(this.score);
    document.getElementById('go-bricks').textContent = `${this.blocksDestroyed} / ${this.totalBlocks}`;
    
    this.menuGameOver.classList.remove('hidden');
    this.hud.classList.add('hidden');
  },

  triggerVictory() {
    this.state = 'VICTORY';
    sounds.victory();
    
    this.checkAndSaveScore(this.score);
    
    // Inject victory title dynamically for completing all 5 levels
    const menuTitle = this.menuVictory.querySelector('.menu-title');
    const menuSubtitle = this.menuVictory.querySelector('.menu-subtitle');
    if (menuTitle) menuTitle.textContent = "VITÓRIA ABSOLUTA!";
    if (menuSubtitle) menuSubtitle.textContent = "Parabéns, você zerou o jogo!";
    
    document.getElementById('vic-score').textContent = this.formatScore(this.score);
    document.getElementById('vic-lives').textContent = this.lives;
    
    this.menuVictory.classList.remove('hidden');
    this.hud.classList.add('hidden');
  },

  formatScore(num) {
    return String(num).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },

  updateHUD() {
    this.scoreVal.textContent = this.formatScore(this.score);
    this.levelVal.textContent = this.currentLevel;
    this.comboVal.textContent = `x${scoreMultiplier}`;
    
    // Reset combo styling classes
    this.comboVal.classList.remove('text-yellow', 'combo-high-glow', 'combo-flash');
    
    if (scoreMultiplier >= 5) {
      this.comboVal.classList.add('combo-high-glow', 'combo-flash');
    } else if (scoreMultiplier > 1) {
      this.comboVal.classList.add('text-yellow');
    }

    const hearts = this.livesIcons.querySelectorAll('.heart-icon');
    hearts.forEach((heart, idx) => {
      if (idx < this.lives) {
        heart.classList.add('active');
      } else {
        heart.classList.remove('active');
      }
    });
  },

  // --- Main Physics/Logic Updates ---
  update() {
    if (this.state !== 'PLAYING') return;

    // Atualiza o screenshake e os offsets
    if (this.shakeDuration > 0) {
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeDuration -= 1 / 60;
      if (this.shakeDuration <= 0) {
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }

    // Atualiza o timer do flash do paddle
    if (this.paddleFlashTimer > 0) {
      this.paddleFlashTimer--;
    }

    // 2. Fireball visual fire particles spawn
    if (this.fireballTimer > 0) {
      this.balls.forEach(b => {
        if (!b.attached) {
          for (let f = 0; f < 2; f++) {
            this.particles.push(new Particle(
              b.x + (Math.random() - 0.5) * 6,
              b.y + (Math.random() - 0.5) * 6,
              Math.random() < 0.45 ? '#ffaa00' : (Math.random() < 0.5 ? '#ff3300' : '#ff0055')
            ));
          }
        }
      });
    }

    // 3. Active timers decrement
    if (this.paddle.expandedTimer > 0) {
      this.paddle.expandedTimer -= 1 / 60;
      if (this.paddle.expandedTimer <= 0) {
        const baseCfg = this.difficultyConfig[this.difficulty];
        const lvlCfg = this.levelConfig[this.currentLevel] || this.levelConfig[1];
        this.paddle.width = baseCfg.paddleWidth * lvlCfg.paddleWidthFactor;
        this.paddle.x = Math.max(0, Math.min(this.canvas.width - this.paddle.width, this.paddle.x));
        
        this.popups.push(new ScorePopup(
          this.paddle.x + this.paddle.width / 2,
          this.paddle.y - 12,
          "LARGURA NORMAL",
          "rgba(255, 255, 255, 0.6)"
        ));
      }
    }

    if (this.paddle.laserTimer > 0) {
      this.paddle.laserTimer -= 1 / 60;
      if (this.paddle.laserTimer <= 0) {
        this.popups.push(new ScorePopup(
          this.paddle.x + this.paddle.width / 2,
          this.paddle.y - 12,
          "LASER EXPIRADO",
          "rgba(255, 255, 255, 0.6)"
        ));
      }
    }

    if (this.paddle.laserCooldown > 0) {
      this.paddle.laserCooldown -= 1 / 60;
    }

    if (this.fireballTimer > 0) {
      this.fireballTimer -= 1 / 60;
      if (this.fireballTimer <= 0) {
        this.popups.push(new ScorePopup(
          this.paddle.x + this.paddle.width / 2,
          this.paddle.y - 12,
          "BOLA DE FOGO EXPIRADA",
          "rgba(255, 255, 255, 0.6)"
        ));
      }
    }

    // 4. Falling Power-ups movement & collection
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.y += p.vy;

      // Circle to Box collision with paddle
      const closestX = Math.max(this.paddle.x, Math.min(p.x, this.paddle.x + this.paddle.width));
      const closestY = Math.max(this.paddle.y, Math.min(p.y, this.paddle.y + this.paddle.height));
      const distX = p.x - closestX;
      const distY = p.y - closestY;
      const distanceSquared = (distX * distX) + (distY * distY);

      if (distanceSquared <= p.radius * p.radius) {
        // Collect Power-up!
        sounds.powerup();
        this.paddleFlashTimer = 8;
        
        if (p.type === 'PADDLE_EXPAND') {
          this.paddle.expandedTimer = 10;
          const baseCfg = this.difficultyConfig[this.difficulty];
          const lvlCfg = this.levelConfig[this.currentLevel] || this.levelConfig[1];
          this.paddle.width = baseCfg.paddleWidth * lvlCfg.paddleWidthFactor * 1.5;
          this.paddle.x = Math.max(0, Math.min(this.canvas.width - this.paddle.width, this.paddle.x));
          
          this.popups.push(new ScorePopup(
            p.x,
            this.paddle.y - 15,
            "BARRA EXPANDIDA +50%",
            "#39ff14"
          ));
        } else if (p.type === 'MULTIBALL') {
          this.spawnExtraBall();
          
          this.popups.push(new ScorePopup(
            p.x,
            this.paddle.y - 15,
            "MULTI-BOLA!",
            "#00f3ff"
          ));
        } else if (p.type === 'LASER') {
          this.paddle.laserTimer = 8;
          this.paddle.laserCooldown = 0;
          
          this.popups.push(new ScorePopup(
            p.x,
            this.paddle.y - 15,
            "CANHÃO LASER [ESPAÇO]",
            "#ff3333"
          ));
        } else if (p.type === 'FIREBALL') {
          this.fireballTimer = 5;
          
          this.popups.push(new ScorePopup(
            p.x,
            this.paddle.y - 15,
            "BOLA DE FOGO PERFURANTE",
            "#ff7700"
          ));
        }

        this.powerups.splice(i, 1);
        continue;
      }

      if (p.y - p.radius > this.canvas.height) {
        this.powerups.splice(i, 1);
      }
    }

    // 5. Lasers simulation and block impact
    for (let k = this.lasers.length - 1; k >= 0; k--) {
      const l = this.lasers[k];
      l.y += l.vy;

      if (l.y + l.height < 0) {
        this.lasers.splice(k, 1);
        continue;
      }

      let laserHit = false;
      for (let i = 0; i < this.bricks.length; i++) {
        const brick = this.bricks[i];
        if (!brick.active) continue;

        // Simple box collision
        if (
          l.x + l.width/2 >= brick.x &&
          l.x - l.width/2 <= brick.x + brick.width &&
          l.y >= brick.y &&
          l.y <= brick.y + brick.height
        ) {
          laserHit = true;

          if (brick.isMetal) {
            // Metal blocks absorb laser beams without taking damage
            this.lasers.splice(k, 1);
            sounds.reinforcedShield(); // Play a metallic impact sound
            // Spawn metallic spark particles
            for (let p = 0; p < 4; p++) {
              this.particles.push(new Particle(l.x, l.y, "#a1a8b8"));
            }
            break;
          }

          brick.hitsLeft--;

          if (brick.hitsLeft === 0) {
            brick.active = false;
            this.blocksDestroyed++;

            if (brick.maxHits === 3) {
              this.triggerScreenshake(0.25, 6);
            }

            const basePoints = brick.points;
            const pointsEarned = basePoints * scoreMultiplier;
            this.score += pointsEarned;

            this.popups.push(new ScorePopup(
              brick.x + brick.width / 2,
              brick.y + brick.height / 2,
              `+${pointsEarned}`,
              brick.isSurprise ? '#ff00d0' : brick.color
            ));

            for (let p = 0; p < 10; p++) {
              this.particles.push(new Particle(l.x, l.y, brick.isSurprise ? '#ff00d0' : brick.color));
            }
            sounds.brick();

            // Spawn Power-Up (100% chance for surprise block, 20% for standard blocks)
            if (brick.isSurprise || Math.random() < 0.20) {
              const types = ['PADDLE_EXPAND', 'MULTIBALL', 'LASER', 'FIREBALL'];
              const type = types[Math.floor(Math.random() * types.length)];
              
              let pColor = '#39ff14';
              if (type === 'MULTIBALL') pColor = '#00f3ff';
              if (type === 'LASER') pColor = '#ff3333';
              if (type === 'FIREBALL') pColor = '#ffaa00';

              this.powerups.push({
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                radius: 9,
                vy: 2.1,
                type: type,
                color: pColor
              });
            }
          } else if (brick.hitsLeft === 2) {
            // Reinforced shield impact (damage 3 -> 2)
            this.triggerScreenshake(0.18, 4);
            this.popups.push(new ScorePopup(
              brick.x + brick.width / 2,
              brick.y + brick.height / 2,
              "ESCUDO -1",
              "#ffcc00"
            ));

            for (let p = 0; p < 4; p++) {
              this.particles.push(new Particle(l.x, l.y, "#ffcc00"));
            }
            sounds.reinforcedShield();
          } else {
            // Shield hit (damage 2 -> 1)
            this.popups.push(new ScorePopup(
              brick.x + brick.width / 2,
              brick.y + brick.height / 2,
              "ESCUDO -1",
              "#9d00ff"
            ));

            for (let p = 0; p < 4; p++) {
              this.particles.push(new Particle(l.x, l.y, "#9d00ff"));
            }
            sounds.shield();
          }

          this.lasers.splice(k, 1);

          // Level Completion Check
          const activeBricks = this.bricks.filter(b => b.active && !b.isMetal).length;
          if (activeBricks === 0) {
            this.triggerLevelComplete();
          }
          break;
        }
      }
    }

    // 6. Balls simulation
    for (let j = this.balls.length - 1; j >= 0; j--) {
      const b = this.balls[j];
      
      if (!b.attached) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 7) {
          b.trail.shift();
        }

        b.x += b.dx;
        b.y += b.dy;

        // Wall collisions
        if (b.x - b.radius < 0) {
          b.x = b.radius;
          b.dx = -b.dx;
          sounds.wall();
        } else if (b.x + b.radius > this.canvas.width) {
          b.x = this.canvas.width - b.radius;
          b.dx = -b.dx;
          sounds.wall();
        }

        if (b.y - b.radius < 0) {
          b.y = b.radius;
          b.dy = -b.dy;
          sounds.wall();
        }

        // Drop below border (loss of ball)
        if (b.y + b.radius > this.canvas.height) {
          this.balls.splice(j, 1);
          
          if (this.balls.length === 0) {
            this.lives--;
            this.updateHUD();
            sounds.lifeLost();
            
            if (this.lives <= 0) {
              this.triggerGameOver();
            } else {
              this.resetBall();
            }
          }
          continue;
        }

        // Paddle bounce
        if (
          b.y + b.radius >= this.paddle.y &&
          b.y - b.radius <= this.paddle.y + this.paddle.height &&
          b.x >= this.paddle.x &&
          b.x <= this.paddle.x + this.paddle.width
        ) {
          b.y = this.paddle.y - b.radius;
          
          const hitPoint = (b.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2);
          const maxAngle = 68 * Math.PI / 180;
          const angle = hitPoint * maxAngle;

          b.dx = b.currentSpeed * Math.sin(angle);
          b.dy = -b.currentSpeed * Math.cos(angle);
          
          scoreMultiplier = 1;
          this.updateHUD();
          
          this.triggerScreenshake(0.12, 3);
          sounds.paddle();
        }

        // Bricks collision resolution
        let brickHitThisFrame = false;
        
        for (let i = 0; i < this.bricks.length; i++) {
          const brick = this.bricks[i];
          if (!brick.active) continue;

          const closestX = Math.max(brick.x, Math.min(b.x, brick.x + brick.width));
          const closestY = Math.max(brick.y, Math.min(b.y, brick.y + brick.height));

          const distX = b.x - closestX;
          const distY = b.y - closestY;
          const distanceSquared = (distX * distX) + (distY * distY);

          if (distanceSquared <= b.radius * b.radius) {
            // Brick collision confirmed
            
            if (brick.isMetal && this.fireballTimer <= 0) {
              // Normal ball: bounces off, no damage, no score, play metallic hit sound and particles
              sounds.reinforcedShield(); // Play metallic sound
              for (let p = 0; p < 4; p++) {
                this.particles.push(new Particle(closestX, closestY, "#a1a8b8"));
              }
              
              // Resolve bounce
              const overlapX = b.radius - Math.abs(distX);
              const overlapY = b.radius - Math.abs(distY);

              if (overlapX < overlapY) {
                b.dx = distX > 0 ? Math.abs(b.dx) : -Math.abs(b.dx);
              } else {
                b.dy = distY > 0 ? Math.abs(b.dy) : -Math.abs(b.dy);
              }
              
              // Speed increase on bounce
              const cfg = this.difficultyConfig[this.difficulty];
              b.currentSpeed += cfg.speedIncrease;
              
              break;
            }

            brickHitThisFrame = true;
            if (brick.isMetal && this.fireballTimer > 0) {
              brick.hitsLeft = 0;
            } else {
              brick.hitsLeft--;
            }

            if (brick.hitsLeft === 0) {
              // Brick destroyed
              brick.active = false;
              this.blocksDestroyed++;

              if (brick.maxHits === 3) {
                this.triggerScreenshake(0.25, 6);
              } else if (brick.isMetal) {
                this.triggerScreenshake(0.3, 8); // Extra screen shake for shattered metal
              }

              const basePoints = brick.points;
              const pointsEarned = basePoints * scoreMultiplier;
              this.score += pointsEarned;
              
              this.popups.push(new ScorePopup(
                brick.x + brick.width / 2,
                brick.y + brick.height / 2,
                `+${pointsEarned}`,
                brick.isSurprise ? '#ff00d0' : brick.color
              ));

              const particleColor = brick.isSurprise ? '#ff00d0' : (brick.isMetal ? '#a1a8b8' : brick.color);
              for (let p = 0; p < 12; p++) {
                this.particles.push(new Particle(closestX, closestY, particleColor));
              }
              sounds.brick();

              // Spawn Power-Up (100% chance for surprise block, 20% for standard blocks)
              if (brick.isSurprise || Math.random() < 0.20) {
                const types = ['PADDLE_EXPAND', 'MULTIBALL', 'LASER', 'FIREBALL'];
                const type = types[Math.floor(Math.random() * types.length)];
                
                let pColor = '#39ff14';
                if (type === 'MULTIBALL') pColor = '#00f3ff';
                if (type === 'LASER') pColor = '#ff3333';
                if (type === 'FIREBALL') pColor = '#ffaa00';

                this.powerups.push({
                  x: brick.x + brick.width / 2,
                  y: brick.y + brick.height / 2,
                  radius: 9,
                  vy: 2.1,
                  type: type,
                  color: pColor
                });
              }
            } else if (brick.hitsLeft === 2) {
              // Reinforced shield impact (damage 3 -> 2)
              this.triggerScreenshake(0.18, 4);
              this.popups.push(new ScorePopup(
                brick.x + brick.width / 2,
                brick.y + brick.height / 2,
                "ESCUDO -1",
                "#ffcc00"
              ));

              for (let p = 0; p < 5; p++) {
                this.particles.push(new Particle(closestX, closestY, "#ffcc00"));
              }
              sounds.reinforcedShield();
            } else {
              // Standard shield impact
              this.popups.push(new ScorePopup(
                brick.x + brick.width / 2,
                brick.y + brick.height / 2,
                "ESCUDO -1",
                "#9d00ff"
              ));

              for (let p = 0; p < 5; p++) {
                this.particles.push(new Particle(closestX, closestY, "#9d00ff"));
              }
              sounds.shield();
            }

            // Elastic collision reflections (By-passed if fireball powerup is active!)
            if (this.fireballTimer <= 0) {
              const overlapX = b.radius - Math.abs(distX);
              const overlapY = b.radius - Math.abs(distY);

              if (overlapX < overlapY) {
                b.dx = distX > 0 ? Math.abs(b.dx) : -Math.abs(b.dx);
              } else {
                b.dy = distY > 0 ? Math.abs(b.dy) : -Math.abs(b.dy);
              }
            }
            
            // Speed increase
            const cfg = this.difficultyConfig[this.difficulty];
            b.currentSpeed += cfg.speedIncrease;
            
            break;
          }
        }

        if (brickHitThisFrame) {
          scoreMultiplier++;
          this.updateHUD();

          // Level Completion Check
          const activeBricks = this.bricks.filter(brick => brick.active && !brick.isMetal).length;
          if (activeBricks === 0) {
            this.triggerLevelComplete();
            break;
          }
        }
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update Popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i];
      popup.update();
      if (popup.alpha <= 0) {
        this.popups.splice(i, 1);
      }
    }
  },

  // --- Drawing Logic ---
  draw() {
    this.ctx.save();

    // Calcula tremor de tela dinâmico ou de Bola de Fogo
    let currentShakeX = this.shakeX;
    let currentShakeY = this.shakeY;
    if (this.fireballTimer > 0 && this.state === 'PLAYING') {
      const isMoving = this.balls.some(b => !b.attached);
      if (isMoving) {
        currentShakeX += (Math.random() - 0.5) * 3.5;
        currentShakeY += (Math.random() - 0.5) * 3.5;
      }
    }

    if (currentShakeX !== 0 || currentShakeY !== 0) {
      this.ctx.translate(currentShakeX, currentShakeY);
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Retro electronic grid
    this.drawBgGrid();

    // 1. Draw active Bricks
    this.drawBricks();

    // 2. Draw falling Power-ups capsules
    this.drawPowerups();

    // 3. Draw Projectile Lasers
    this.drawLasers();

    // 4. Draw Particles
    this.particles.forEach(p => p.draw(this.ctx));

    // 5. Draw score Popups
    this.popups.forEach(pop => pop.draw(this.ctx));

    // 6. Draw Paddle
    this.drawPaddle();

    // 7. Draw all active Balls & Trails
    this.drawBalls();

    // 8. Draw Active Powerups Timer display
    this.drawPowerupTimers();

    // Overlays
    if (this.state === 'PAUSED') {
      this.drawPauseScreen();
    } else if (this.state === 'LEVEL_COMPLETE') {
      this.drawLevelCompleteScreen();
    }

    this.ctx.restore();
  },

  drawBgGrid() {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 102, 255, 0.04)';
    this.ctx.lineWidth = 1;

    const spacing = 40;
    for (let x = 0; x < this.canvas.width; x += spacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += spacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  },

  drawPaddle() {
    const p = this.paddle;
    this.ctx.save();
    
    if (this.paddleFlashTimer > 0) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowColor = '#ffffff';
      this.ctx.shadowBlur = 25;
    } else {
      // Select outline and fill colors dynamically based on active power-ups
      const grad = this.ctx.createLinearGradient(p.x, p.y, p.x + p.width, p.y);
      
      if (p.laserTimer > 0) {
        // Red metallic styling when equipped with lasers
        grad.addColorStop(0, '#990000');
        grad.addColorStop(0.5, '#ff3333');
        grad.addColorStop(1, '#990000');
        this.ctx.shadowColor = 'rgba(255, 51, 51, 0.75)';
      } else if (p.expandedTimer > 0) {
        // Green metallic styling when expanded
        grad.addColorStop(0, '#009900');
        grad.addColorStop(0.5, '#39ff14');
        grad.addColorStop(1, '#009900');
        this.ctx.shadowColor = 'rgba(57, 255, 20, 0.75)';
      } else {
        // Standard cyan/blue metallic styling
        grad.addColorStop(0, '#0066ff');
        grad.addColorStop(0.5, '#00f3ff');
        grad.addColorStop(1, '#0066ff');
        this.ctx.shadowColor = 'rgba(0, 243, 255, 0.6)';
      }
      
      this.ctx.fillStyle = grad;
      this.ctx.shadowBlur = 15;
    }
    
    this.ctx.beginPath();
    this.ctx.roundRect(p.x, p.y, p.width, p.height, p.height / 2);
    this.ctx.fill();
    
    // Turret cannons drawings if armed with lasers
    if (p.laserTimer > 0) {
      this.ctx.fillStyle = '#b30000';
      this.ctx.strokeStyle = '#ff3333';
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowBlur = 0;

      // Left turret
      this.ctx.beginPath();
      this.ctx.roundRect(p.x + 8, p.y - 6, 6, 6, 1);
      this.ctx.fill();
      this.ctx.stroke();

      // Right turret
      this.ctx.beginPath();
      this.ctx.roundRect(p.x + p.width - 14, p.y - 6, 6, 6, 1);
      this.ctx.fill();
      this.ctx.stroke();
    }
    
    // Inner reflective core line
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(p.x + 4, p.y + 3, p.width - 8, p.height - 6, (p.height - 6) / 2);
    this.ctx.stroke();
    
    this.ctx.restore();
  },

  drawBalls() {
    this.balls.forEach(b => {
      this.ctx.save();

      // Glowing traces
      b.trail.forEach((pos, i) => {
        const alpha = (i / b.trail.length) * 0.35;
        const size = b.radius * (0.4 + (i / b.trail.length) * 0.6);
        
        let trailColor = b.color;
        if (this.fireballTimer > 0) {
          trailColor = '#ff5500';
        }
        this.ctx.fillStyle = trailColor;
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
        this.ctx.fill();
      });

      this.ctx.globalAlpha = 1.0;
      
      const grad = this.ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.radius);
      grad.addColorStop(0, '#ffffff');
      
      // Determine sphere and glow colors dynamically
      if (this.fireballTimer > 0) {
        grad.addColorStop(0.2, '#ffaa00');
        grad.addColorStop(1, '#ff3300');
        this.ctx.shadowColor = '#ff6600';
      } else if (b.color === '#00f3ff') {
        grad.addColorStop(0.2, '#66e0ff');
        grad.addColorStop(1, '#00f3ff');
        this.ctx.shadowColor = '#00f3ff';
      } else {
        grad.addColorStop(0.2, '#ff66b2');
        grad.addColorStop(1, '#ff007f');
        this.ctx.shadowColor = '#ff007f';
      }
      
      this.ctx.fillStyle = grad;
      this.ctx.shadowBlur = 15;
      
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.restore();
    });
  },

  drawPowerups() {
    this.ctx.save();
    this.powerups.forEach(p => {
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = p.color;
      
      this.ctx.fillStyle = 'rgba(11, 13, 28, 0.95)';
      this.ctx.strokeStyle = p.color;
      this.ctx.lineWidth = 1.8;
      
      const w = 26;
      const h = 14;
      this.ctx.beginPath();
      this.ctx.roundRect(p.x - w/2, p.y - h/2, w, h, h/2);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 9px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.shadowBlur = 0;
      
      let icon = '↔';
      if (p.type === 'MULTIBALL') icon = '●●';
      if (p.type === 'LASER') icon = '⇈';
      if (p.type === 'FIREBALL') icon = '🔥';

      this.ctx.fillText(icon, p.x, p.y);
    });
    this.ctx.restore();
  },

  drawLasers() {
    this.ctx.save();
    this.ctx.fillStyle = '#ff3333';
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = '#ff3333';

    this.lasers.forEach(l => {
      this.ctx.beginPath();
      this.ctx.roundRect(l.x - l.width/2, l.y, l.width, l.height, l.width/2);
      this.ctx.fill();
    });

    this.ctx.restore();
  },

  drawBricks() {
    this.ctx.save();
    
    for (let i = 0; i < this.bricks.length; i++) {
      const b = this.bricks[i];
      if (!b.active) continue;

      if (b.isMetal) {
        // Render metal block
        const grad = this.ctx.createLinearGradient(b.x, b.y, b.x + b.width, b.y + b.height);
        grad.addColorStop(0, '#555964');
        grad.addColorStop(0.3, '#a1a8b8');
        grad.addColorStop(0.7, '#676e7f');
        grad.addColorStop(1, '#3a3d45');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(b.x, b.y, b.width, b.height);

        // Bright steel outline
        this.ctx.strokeStyle = '#cdd4e2';
        this.ctx.lineWidth = 2.0;
        this.ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Crossed industrial rivets / details
        this.ctx.strokeStyle = 'rgba(205, 212, 226, 0.25)';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        this.ctx.moveTo(b.x + 3, b.y + 3);
        this.ctx.lineTo(b.x + b.width - 3, b.y + b.height - 3);
        this.ctx.moveTo(b.x + b.width - 3, b.y + 3);
        this.ctx.lineTo(b.x + 3, b.y + b.height - 3);
        this.ctx.stroke();

        // Subtle metal studs in the corners
        this.ctx.fillStyle = '#cdd4e2';
        const studs = [
          {x: b.x + 4, y: b.y + 4},
          {x: b.x + b.width - 4, y: b.y + 4},
          {x: b.x + 4, y: b.y + b.height - 4},
          {x: b.x + b.width - 4, y: b.y + b.height - 4}
        ];
        studs.forEach(s => {
          this.ctx.beginPath();
          this.ctx.arc(s.x, s.y, 1.2, 0, Math.PI * 2);
          this.ctx.fill();
        });
      } else if (b.isSurprise) {
        // Deep purple fill
        this.ctx.fillStyle = 'rgba(24, 12, 45, 0.96)';
        this.ctx.fillRect(b.x, b.y, b.width, b.height);

        // Glowing magenta neon outline
        this.ctx.strokeStyle = '#ff00d0';
        this.ctx.lineWidth = 2.0;
        this.ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Monospaced "?" glyph in white with neon glow
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '600 13px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        this.ctx.save();
        this.ctx.shadowBlur = 6;
        this.ctx.shadowColor = '#ff00d0';
        this.ctx.fillText('?', b.x + b.width / 2, b.y + b.height / 2);
        this.ctx.restore();
      } else if (b.hitsLeft === 3) {
        // Reinforced super-armored 3-hit block (Level 4/5)
        this.ctx.fillStyle = 'rgba(42, 12, 24, 0.98)';
        this.ctx.fillRect(b.x, b.y, b.width, b.height);

        // Glowing gold outline
        this.ctx.strokeStyle = '#ffcc00';
        this.ctx.lineWidth = 2.0;
        this.ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Reinforced mechanical shield lines
        this.ctx.strokeStyle = 'rgba(255, 204, 0, 0.35)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        // Horizontal divider
        this.ctx.moveTo(b.x + 4, b.y + b.height / 2);
        this.ctx.lineTo(b.x + b.width - 4, b.y + b.height / 2);
        // Vertical segments
        this.ctx.moveTo(b.x + b.width / 3, b.y + 3);
        this.ctx.lineTo(b.x + b.width / 3, b.y + b.height - 3);
        this.ctx.moveTo(b.x + (b.width * 2) / 3, b.y + 3);
        this.ctx.lineTo(b.x + (b.width * 2) / 3, b.y + b.height - 3);
        this.ctx.stroke();
      } else if (b.hitsLeft === 2) {
        // Futuristic double-hit armored block
        this.ctx.fillStyle = 'rgba(24, 27, 58, 0.95)';
        this.ctx.fillRect(b.x, b.y, b.width, b.height);

        // Glowing purple shield outline
        this.ctx.strokeStyle = '#9d00ff';
        this.ctx.lineWidth = 2.0;
        this.ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Inner shield cross-hatch structure
        this.ctx.strokeStyle = 'rgba(157, 0, 255, 0.35)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(b.x + 6, b.y + 4);
        this.ctx.lineTo(b.x + b.width - 6, b.y + b.height - 4);
        this.ctx.moveTo(b.x + b.width - 6, b.y + 4);
        this.ctx.lineTo(b.x + 6, b.y + b.height - 4);
        this.ctx.stroke();
      } else {
        // Standard single hit or broken shield block
        this.ctx.fillStyle = 'rgba(13, 16, 32, 0.8)';
        this.ctx.fillRect(b.x, b.y, b.width, b.height);

        this.ctx.strokeStyle = b.color;
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(b.x, b.y, b.width, b.height);

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.globalAlpha = 0.55;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(b.x + 2, b.y + 2);
        this.ctx.lineTo(b.x + b.width - 2, b.y + 2);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;
      }
    }
    this.ctx.restore();
  },

  drawPowerupTimers() {
    let drawY = 84;
    
    if (this.paddle.expandedTimer > 0) {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(57, 255, 20, 0.85)';
      this.ctx.font = '600 12px "Outfit"';
      this.ctx.textAlign = 'right';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#39ff14';
      this.ctx.fillText(`EXPANSÃO: ${this.paddle.expandedTimer.toFixed(1)}s`, this.canvas.width - 24, drawY);
      this.ctx.restore();
      drawY += 18;
    }

    if (this.paddle.laserTimer > 0) {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255, 51, 51, 0.85)';
      this.ctx.font = '600 12px "Outfit"';
      this.ctx.textAlign = 'right';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ff3333';
      this.ctx.fillText(`CANHÃO LASER: ${this.paddle.laserTimer.toFixed(1)}s`, this.canvas.width - 24, drawY);
      this.ctx.restore();
      drawY += 18;
    }

    if (this.fireballTimer > 0) {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255, 119, 0, 0.85)';
      this.ctx.font = '600 12px "Outfit"';
      this.ctx.textAlign = 'right';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ff7700';
      this.ctx.fillText(`BOLA DE FOGO: ${this.fireballTimer.toFixed(1)}s`, this.canvas.width - 24, drawY);
      this.ctx.restore();
    }
  },

  drawPauseScreen() {
    // A tela de pausa agora utiliza o overlay HTML `#menu-pause` nativo para melhor fidelidade e controles interativos.
  },

  drawLevelCompleteScreen() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(5, 6, 12, 0.5)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Glowing level cleared text
    this.ctx.fillStyle = '#ffea00';
    this.ctx.font = '800 42px "Outfit"';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = 'rgba(255, 234, 0, 0.7)';
    this.ctx.fillText('NÍVEL CONCLUÍDO!', this.canvas.width / 2, this.canvas.height / 2 - 15);
    
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '400 15px "Outfit"';
    this.ctx.shadowBlur = 0;
    this.ctx.fillText(`Preparando Nível ${this.currentLevel + 1}...`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    
    this.ctx.restore();
  },

  // --- Main Animation Loop ---
  loop() {
    this.update();
    this.draw();
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }
};

// Start application
window.onload = () => {
  game.init();
};

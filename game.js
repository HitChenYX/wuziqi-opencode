/**
 * 五子棋核心逻辑 + AI 对战（香猪1号）
 *
 * 设计目标：
 * 1. 完整的 15x15 五子棋规则
 * 2. 人机对战（玩家黑棋，AI 白棋）
 * 3. 提供清晰的对外接口，便于接入任意前端 UI
 * 4. 采用模块化类设计，避免全局变量污染
 */

(() => {
  'use strict';

  /** 棋盘尺寸（15x15） */
  const BOARD_SIZE = 15;

  /** 棋子类型常量 */
  const PIECE = {
    EMPTY: 0,
    BLACK: 1, // 玩家（先手）
    WHITE: 2, // AI（后手）
  };

  /** 胜负检测的四个主方向：横、竖、主对角、副对角 */
  const DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  /**
   * 工具函数：创建二维棋盘
   * @param {number} size 棋盘边长
   * @returns {number[][]}
   */
  function createBoard(size = BOARD_SIZE) {
    return Array.from({ length: size }, () => Array(size).fill(PIECE.EMPTY));
  }

  /**
   * 工具函数：浅拷贝棋盘（按行复制）
   * @param {number[][]} board
   * @returns {number[][]}
   */
  function cloneBoard(board) {
    return board.map((row) => [...row]);
  }

  /**
   * 香猪1号 AI
   *
   * 核心思路：
   * 1. 优先处理“立即获胜”和“立即防守”
   * 2. 使用攻防一体评分：进攻分 + 防守分
   * 3. 对候选点做浅层极小化极大搜索（默认 2 层）
   */
  class XiangZhuAI {
    /**
     * @param {GomokuGame} game 游戏实例
     * @param {object} [config]
     */
    constructor(game, config = {}) {
      this.game = game;
      this.name = '香猪1号';

      // 搜索配置：默认 2 层。可改为 3（计算更慢但更强）
      this.searchDepth = config.searchDepth ?? 2;

      // 每层候选点数量（越大越强，越慢）
      this.candidateLimit = config.candidateLimit ?? 12;

      // 评分权重：防守略高，防止漏防对手强威胁
      this.attackWeight = config.attackWeight ?? 1.0;
      this.defenseWeight = config.defenseWeight ?? 1.15;
    }

    /**
     * AI 思考入口
     * @returns {{row:number,col:number}|null}
     */
    think() {
      const board = this.game.board;
      const ai = PIECE.WHITE;
      const human = PIECE.BLACK;

      const candidates = this.getCandidateMoves(board);
      if (candidates.length === 0) {
        return null;
      }

      // 1) AI 立即获胜点（最优先）
      const winMove = this.findImmediateWinningMove(board, ai, candidates);
      if (winMove) return winMove;

      // 2) 阻挡玩家立即获胜点（次优先）
      const blockMove = this.findImmediateWinningMove(board, human, candidates);
      if (blockMove) return blockMove;

      // 3) 浅层搜索（攻防综合）
      let bestMove = candidates[0];
      let bestScore = -Infinity;

      for (const move of candidates) {
        board[move.row][move.col] = ai;
        const score = this.minimax(
          board,
          this.searchDepth - 1,
          false,
          -Infinity,
          Infinity,
          ai,
          human
        );
        board[move.row][move.col] = PIECE.EMPTY;

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }

      return bestMove;
    }

    /**
     * 极小化极大搜索 + Alpha-Beta 剪枝
     * @private
     */
    minimax(board, depth, isMaximizing, alpha, beta, ai, human) {
      if (this.hasAnyWin(board, ai)) return 10_000_000;
      if (this.hasAnyWin(board, human)) return -10_000_000;

      if (depth <= 0 || this.isBoardFull(board)) {
        return this.evaluateBoard(board, ai, human);
      }

      const moves = this.getCandidateMoves(board);
      if (moves.length === 0) {
        return this.evaluateBoard(board, ai, human);
      }

      if (isMaximizing) {
        let value = -Infinity;
        for (const move of moves) {
          board[move.row][move.col] = ai;
          const score = this.minimax(board, depth - 1, false, alpha, beta, ai, human);
          board[move.row][move.col] = PIECE.EMPTY;

          value = Math.max(value, score);
          alpha = Math.max(alpha, value);
          if (beta <= alpha) break;
        }
        return value;
      }

      let value = Infinity;
      for (const move of moves) {
        board[move.row][move.col] = human;
        const score = this.minimax(board, depth - 1, true, alpha, beta, ai, human);
        board[move.row][move.col] = PIECE.EMPTY;

        value = Math.min(value, score);
        beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return value;
    }

    /**
     * 棋盘综合评分（进攻 + 防守）
     * @private
     */
    evaluateBoard(board, ai, human) {
      let attackScore = 0;
      let defenseScore = 0;

      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] !== PIECE.EMPTY) continue;

          // 评估 AI 在该点落子的进攻收益
          attackScore += this.evaluatePoint(board, row, col, ai);

          // 评估玩家在该点落子的威胁（AI 视角防守价值）
          defenseScore += this.evaluatePoint(board, row, col, human);
        }
      }

      return attackScore * this.attackWeight - defenseScore * this.defenseWeight;
    }

    /**
     * 评估某个空位对某一方的价值
     * @private
     */
    evaluatePoint(board, row, col, player) {
      let total = 0;
      for (const [dr, dc] of DIRECTIONS) {
        total += this.evaluateDirection(board, row, col, player, dr, dc);
      }
      return total;
    }

    /**
     * 按单方向评估形状（连子数 + 两端是否活口）
     * @private
     */
    evaluateDirection(board, row, col, player, dr, dc) {
      const left = this.countContinuous(board, row, col, player, -dr, -dc);
      const right = this.countContinuous(board, row, col, player, dr, dc);

      const total = left.count + right.count + 1;
      const openEnds = (left.open ? 1 : 0) + (right.open ? 1 : 0);

      return this.patternScore(total, openEnds);
    }

    /**
     * 连续棋子计数 + 末端活口判断
     * @private
     */
    countContinuous(board, row, col, player, dr, dc) {
      let r = row + dr;
      let c = col + dc;
      let count = 0;

      while (this.inBounds(r, c) && board[r][c] === player) {
        count++;
        r += dr;
        c += dc;
      }

      const open = this.inBounds(r, c) && board[r][c] === PIECE.EMPTY;
      return { count, open };
    }

    /**
     * 形状评分表
     * @private
     */
    patternScore(count, openEnds) {
      if (count >= 5) return 1_000_000;

      // 死形（两端都堵）
      if (openEnds === 0) return 0;

      // 四连
      if (count === 4) {
        if (openEnds === 2) return 100_000; // 活四
        if (openEnds === 1) return 20_000; // 冲四
      }

      // 三连
      if (count === 3) {
        if (openEnds === 2) return 8_000; // 活三
        if (openEnds === 1) return 1_500; // 眠三
      }

      // 二连
      if (count === 2) {
        if (openEnds === 2) return 1_200; // 活二
        if (openEnds === 1) return 200; // 眠二
      }

      // 单子
      if (count === 1) {
        if (openEnds === 2) return 80;
        if (openEnds === 1) return 15;
      }

      return 0;
    }

    /**
     * 获取候选点：仅考虑“已有棋子附近”的空位
     * 可显著降低搜索分支
     * @private
     */
    getCandidateMoves(board) {
      const hasStone = this.hasAnyStone(board);

      // 开局：若棋盘为空，优先中间
      if (!hasStone) {
        const center = Math.floor(BOARD_SIZE / 2);
        return [{ row: center, col: center }];
      }

      const candidates = [];
      const visited = new Set();

      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] !== PIECE.EMPTY) continue;
          if (!this.hasNeighborStone(board, row, col, 2)) continue;

          const key = `${row},${col}`;
          if (visited.has(key)) continue;
          visited.add(key);

          // 先做快速启发式评分，用于排序和截断
          const attack = this.evaluatePoint(board, row, col, PIECE.WHITE);
          const defense = this.evaluatePoint(board, row, col, PIECE.BLACK);
          const priority = attack + defense * 1.2;

          candidates.push({ row, col, priority });
        }
      }

      candidates.sort((a, b) => b.priority - a.priority);
      return candidates.slice(0, this.candidateLimit).map(({ row, col }) => ({ row, col }));
    }

    /**
     * 查找“下一手即可获胜”的位置
     * @private
     */
    findImmediateWinningMove(board, player, candidates) {
      for (const move of candidates) {
        board[move.row][move.col] = player;
        const win = this.game.checkWin(move.row, move.col, player, board);
        board[move.row][move.col] = PIECE.EMPTY;
        if (win) return move;
      }
      return null;
    }

    /**
     * 判断棋盘是否出现某方胜利
     * @private
     */
    hasAnyWin(board, player) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] !== player) continue;
          if (this.game.checkWin(row, col, player, board)) return true;
        }
      }
      return false;
    }

    /**
     * 是否存在任意棋子
     * @private
     */
    hasAnyStone(board) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] !== PIECE.EMPTY) return true;
        }
      }
      return false;
    }

    /**
     * 目标点附近是否有棋子
     * @private
     */
    hasNeighborStone(board, row, col, radius = 1) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = row + dr;
          const c = col + dc;
          if (!this.inBounds(r, c)) continue;
          if (board[r][c] !== PIECE.EMPTY) return true;
        }
      }
      return false;
    }

    /**
     * 判断棋盘是否已满
     * @private
     */
    isBoardFull(board) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] === PIECE.EMPTY) return false;
        }
      }
      return true;
    }

    /**
     * 坐标是否在棋盘内
     * @private
     */
    inBounds(row, col) {
      return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }
  }

  /**
   * 五子棋主控制器
   *
   * 使用方式（示例）：
   * const game = new GomokuGame({ onBoardChange: ({ board }) => render(board) });
   * game.playerMove(7, 7);
   */
  class GomokuGame {
    /**
     * @param {object} [options]
     * @param {(payload:any)=>void} [options.onBoardChange] 棋盘更新回调
     * @param {(payload:any)=>void} [options.onTurnChange] 回合变化回调
     * @param {(payload:any)=>void} [options.onGameOver] 游戏结束回调
     * @param {(payload:any)=>void} [options.onMessage] 消息回调
     * @param {(payload:any)=>void} [options.onAIMoveStart] AI 开始思考回调
     * @param {(payload:any)=>void} [options.onAIMoveEnd] AI 结束思考回调
     * @param {object} [options.aiConfig] AI 配置
     */
    constructor(options = {}) {
      this.callbacks = {
        onBoardChange: options.onBoardChange,
        onTurnChange: options.onTurnChange,
        onGameOver: options.onGameOver,
        onMessage: options.onMessage,
        onAIMoveStart: options.onAIMoveStart,
        onAIMoveEnd: options.onAIMoveEnd,
      };

      this.board = createBoard();
      this.currentPlayer = PIECE.BLACK; // 黑棋先行（玩家）
      this.isGameOver = false;
      this.winner = null;

      // 记录走子历史，用于悔棋
      this.moveHistory = [];

      // AI：香猪1号（白棋）
      this.ai = new XiangZhuAI(this, options.aiConfig || {});
    }

    /**
     * 初始化 / 清空棋盘
     */
    initBoard() {
      this.board = createBoard();
      this.currentPlayer = PIECE.BLACK;
      this.isGameOver = false;
      this.winner = null;
      this.moveHistory = [];

      this.emit('onBoardChange', this.getGameState());
      this.emit('onTurnChange', this.getGameState());
    }

    /**
     * 重新开始游戏
     */
    restartGame() {
      this.initBoard();
      this.emit('onMessage', { text: '游戏已重新开始，黑棋先行。' });
    }

    /**
     * 获取当前游戏状态快照
     * @returns {object}
     */
    getGameState() {
      return {
        board: cloneBoard(this.board),
        currentPlayer: this.currentPlayer,
        isGameOver: this.isGameOver,
        winner: this.winner,
        moveCount: this.moveHistory.length,
        aiName: this.ai.name,
      };
    }

    /**
     * 坐标合法性判断
     */
    inBounds(row, col) {
      return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    /**
     * 指定点是否可落子
     */
    isValidMove(row, col) {
      if (!this.inBounds(row, col)) return false;
      if (this.isGameOver) return false;
      return this.board[row][col] === PIECE.EMPTY;
    }

    /**
     * 通用落子函数
     * @param {number} row
     * @param {number} col
     * @param {number} player
     * @returns {boolean}
     */
    placeStone(row, col, player) {
      if (!this.isValidMove(row, col)) {
        return false;
      }

      this.board[row][col] = player;
      this.moveHistory.push({ row, col, player });

      // 检查是否胜利
      if (this.checkWin(row, col, player)) {
        this.isGameOver = true;
        this.winner = player;
      } else if (this.isBoardFull()) {
        // 平局
        this.isGameOver = true;
        this.winner = 0;
      } else {
        // 切换回合
        this.currentPlayer = player === PIECE.BLACK ? PIECE.WHITE : PIECE.BLACK;
      }

      this.emit('onBoardChange', {
        ...this.getGameState(),
        lastMove: { row, col, player },
      });

      if (this.isGameOver) {
        this.emit('onGameOver', this.getGameState());
      } else {
        this.emit('onTurnChange', this.getGameState());
      }

      return true;
    }

    /**
     * 玩家落子（黑棋）
     * 成功后自动触发 AI 落子
     * @param {number} row
     * @param {number} col
     * @returns {boolean}
     */
    playerMove(row, col) {
      if (this.currentPlayer !== PIECE.BLACK) {
        this.emit('onMessage', { text: '当前不是玩家回合。' });
        return false;
      }

      const placed = this.placeStone(row, col, PIECE.BLACK);
      if (!placed) {
        this.emit('onMessage', { text: '落子无效，请选择空位。' });
        return false;
      }

      // 玩家落子后若未结束，触发 AI 思考
      if (!this.isGameOver) {
        this.aiMove();
      }

      return true;
    }

    /**
     * AI 落子（白棋）
     * 使用 setTimeout 模拟思考，避免阻塞 UI
     */
    aiMove() {
      if (this.isGameOver || this.currentPlayer !== PIECE.WHITE) return;

      this.emit('onAIMoveStart', {
        text: `${this.ai.name} 正在思考...`,
        aiName: this.ai.name,
      });

      setTimeout(() => {
        if (this.isGameOver || this.currentPlayer !== PIECE.WHITE) return;

        const move = this.ai.think();
        if (!move) {
          // 没有可走点（理论上只有满盘）
          this.isGameOver = true;
          this.winner = 0;
          this.emit('onGameOver', this.getGameState());
          return;
        }

        this.placeStone(move.row, move.col, PIECE.WHITE);
        this.emit('onAIMoveEnd', {
          aiName: this.ai.name,
          move,
          state: this.getGameState(),
        });
      }, 120);
    }

    /**
     * 悔棋（可选功能）
     * 默认回退两步：玩家一步 + AI 一步
     * @param {number} steps 回退步数，默认 2
     * @returns {boolean}
     */
    undo(steps = 2) {
      if (this.moveHistory.length === 0) {
        this.emit('onMessage', { text: '当前没有可悔棋记录。' });
        return false;
      }

      const undoSteps = Math.max(1, Math.min(steps, this.moveHistory.length));
      for (let i = 0; i < undoSteps; i++) {
        const move = this.moveHistory.pop();
        this.board[move.row][move.col] = PIECE.EMPTY;
      }

      this.isGameOver = false;
      this.winner = null;

      // 根据最后一步确定下一个玩家
      if (this.moveHistory.length === 0) {
        this.currentPlayer = PIECE.BLACK;
      } else {
        const last = this.moveHistory[this.moveHistory.length - 1];
        this.currentPlayer = last.player === PIECE.BLACK ? PIECE.WHITE : PIECE.BLACK;
      }

      this.emit('onBoardChange', this.getGameState());
      this.emit('onTurnChange', this.getGameState());
      this.emit('onMessage', { text: `已悔棋 ${undoSteps} 步。` });
      return true;
    }

    /**
     * 胜负判断：检查最近落子点在四个方向是否形成五连
     * @param {number} row
     * @param {number} col
     * @param {number} player
     * @param {number[][]} [customBoard]
     * @returns {boolean}
     */
    checkWin(row, col, player, customBoard = this.board) {
      for (const [dr, dc] of DIRECTIONS) {
        const count =
          1 +
          this.countDirection(customBoard, row, col, player, dr, dc) +
          this.countDirection(customBoard, row, col, player, -dr, -dc);

        if (count >= 5) {
          return true;
        }
      }
      return false;
    }

    /**
     * 单方向连续同色计数
     */
    countDirection(board, row, col, player, dr, dc) {
      let r = row + dr;
      let c = col + dc;
      let count = 0;

      while (this.inBounds(r, c) && board[r][c] === player) {
        count++;
        r += dr;
        c += dc;
      }

      return count;
    }

    /**
     * 检测棋盘是否已满
     */
    isBoardFull() {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (this.board[row][col] === PIECE.EMPTY) {
            return false;
          }
        }
      }
      return true;
    }

    /**
     * 统一事件触发封装
     * @private
     */
    emit(eventName, payload) {
      const fn = this.callbacks[eventName];
      if (typeof fn === 'function') {
        fn(payload);
      }
    }
  }

  /**
   * 对外暴露 API
   * 1) 浏览器环境：挂载到 window.Gomoku
   * 2) CommonJS 环境：module.exports
   */
  const GomokuAPI = {
    GomokuGame,
    XiangZhuAI,
    PIECE,
    BOARD_SIZE,
    createBoard,
  };

  if (typeof window !== 'undefined') {
    window.Gomoku = GomokuAPI;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GomokuAPI;
  }
})();

// ==================== UI初始化和Canvas绘制 ====================

let game;
let canvas;
let ctx;
let cellSize = 40;
let boardPadding = 20;
let timerInterval;
let gameStartTime;

/**
 * 初始化游戏UI
 */
function initGameUI() {
  canvas = document.getElementById('game-board');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }
  
  ctx = canvas.getContext('2d');
  
  // 计算格子大小
  const boardSize = 15;
  cellSize = (canvas.width - boardPadding * 2) / (boardSize - 1);
  
  // 初始化游戏实例
  game = new window.Gomoku.GomokuGame({
    onBoardChange: handleBoardChange,
    onTurnChange: handleTurnChange,
    onGameOver: handleGameOver,
    onMessage: showMessage,
    onAIMoveStart: handleAIMoveStart,
    onAIMoveEnd: handleAIMoveEnd
  });
  
  // 绑定事件
  bindEvents();
  
  // 初始化显示
  game.initBoard();
  startTimer();
  updatePlayerDisplay();
  
  console.log('五子棋游戏初始化完成！');
}

/**
 * 绘制棋盘
 */
function drawBoard() {
  const size = 15;
  const width = canvas.width;
  const height = canvas.height;
  
  // 清空画布
  ctx.clearRect(0, 0, width, height);
  
  // 绘制背景
  ctx.fillStyle = '#f0c78a';
  ctx.fillRect(0, 0, width, height);
  
  // 绘制网格线
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 1;
  
  for (let i = 0; i < size; i++) {
    const pos = boardPadding + i * cellSize;
    
    // 横线
    ctx.beginPath();
    ctx.moveTo(boardPadding, pos);
    ctx.lineTo(width - boardPadding, pos);
    ctx.stroke();
    
    // 竖线
    ctx.beginPath();
    ctx.moveTo(pos, boardPadding);
    ctx.lineTo(pos, height - boardPadding);
    ctx.stroke();
  }
  
  // 绘制星位（天元及四角星）
  const stars = [
    [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
  ];
  
  ctx.fillStyle = '#8b4513';
  stars.forEach(([row, col]) => {
    const x = boardPadding + col * cellSize;
    const y = boardPadding + row * cellSize;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * 绘制棋子
 */
function drawPiece(row, col, piece) {
  const x = boardPadding + col * cellSize;
  const y = boardPadding + row * cellSize;
  const radius = cellSize * 0.4;
  
  if (piece === window.Gomoku.PIECE.BLACK) {
    // 黑棋
    const gradient = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, 1,
      x, y, radius
    );
    gradient.addColorStop(0, '#666');
    gradient.addColorStop(1, '#000');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (piece === window.Gomoku.PIECE.WHITE) {
    // 白棋
    const gradient = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, 1,
      x, y, radius
    );
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#ddd');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 白棋边框
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * 渲染整个棋盘
 */
function renderBoard() {
  drawBoard();
  
  const state = game.getGameState();
  const board = state.board;
  
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      if (board[row][col] !== window.Gomoku.PIECE.EMPTY) {
        drawPiece(row, col, board[row][col]);
      }
    }
  }
}

/**
 * 绑定事件
 */
function bindEvents() {
  // Canvas点击事件
  canvas.addEventListener('click', handleCanvasClick);
  
  // 重新开始按钮
  const restartBtn = document.getElementById('restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      game.restartGame();
      startTimer();
      updatePlayerDisplay();
    });
  }
  
  // 悔棋按钮
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      game.undo(2); // 悔棋2步（玩家和AI各一步）
    });
  }
}

/**
 * 处理Canvas点击
 */
function handleCanvasClick(event) {
  if (game.getGameState().isGameOver) return;
  if (game.getGameState().currentPlayer !== window.Gomoku.PIECE.BLACK) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  // 计算点击的格子
  const col = Math.round((x - boardPadding) / cellSize);
  const row = Math.round((y - boardPadding) / cellSize);
  
  // 检查边界
  if (row < 0 || row >= 15 || col < 0 || col >= 15) return;
  
  // 玩家落子
  game.playerMove(row, col);
}

/**
 * 处理棋盘变化
 */
function handleBoardChange(state) {
  renderBoard();
  updateTurnDisplay();
}

/**
 * 处理回合变化
 */
function handleTurnChange(state) {
  updateTurnDisplay();
}

/**
 * 处理游戏结束
 */
function handleGameOver(state) {
  stopTimer();
  updateTurnDisplay();
  
  setTimeout(() => {
    if (state.winner === window.Gomoku.PIECE.BLACK) {
      alert('🎉 恭喜你获胜！');
    } else if (state.winner === window.Gomoku.PIECE.WHITE) {
      alert('😔 香猪1号获胜了，再试一次吧！');
    } else {
      alert('🤝 平局！旗鼓相当的对手！');
    }
  }, 300);
}

/**
 * 显示消息
 */
function showMessage(data) {
  console.log('[五子棋]', data.text);
}

/**
 * 处理AI开始思考
 */
function handleAIMoveStart(data) {
  const statusEl = document.getElementById('game-status');
  if (statusEl) {
    statusEl.textContent = '香猪1号 正在思考...';
    statusEl.className = 'status-value ai-thinking';
  }
  
  // 禁用棋盘交互
  canvas.style.cursor = 'wait';
}

/**
 * 处理AI结束思考
 */
function handleAIMoveEnd(data) {
  const statusEl = document.getElementById('game-status');
  if (statusEl) {
    statusEl.textContent = '黑棋回合';
    statusEl.className = 'status-value player-turn';
  }
  
  // 恢复棋盘交互
  canvas.style.cursor = 'pointer';
}

/**
 * 更新回合显示
 */
function updateTurnDisplay() {
  const state = game.getGameState();
  const statusEl = document.getElementById('game-status');
  const blackCard = document.querySelector('.player-black');
  const whiteCard = document.querySelector('.player-white');
  
  if (state.isGameOver) {
    if (statusEl) {
      if (state.winner === window.Gomoku.PIECE.BLACK) {
        statusEl.textContent = '玩家获胜！';
        statusEl.className = 'status-value game-over';
      } else if (state.winner === window.Gomoku.PIECE.WHITE) {
        statusEl.textContent = '香猪1号 获胜';
        statusEl.className = 'status-value game-over';
      } else {
        statusEl.textContent = '平局';
        statusEl.className = 'status-value game-over';
      }
    }
    
    if (blackCard) blackCard.classList.remove('active');
    if (whiteCard) whiteCard.classList.remove('active');
  } else {
    if (state.currentPlayer === window.Gomoku.PIECE.BLACK) {
      if (statusEl) {
        statusEl.textContent = '黑棋回合';
        statusEl.className = 'status-value player-turn';
      }
      if (blackCard) blackCard.classList.add('active');
      if (whiteCard) whiteCard.classList.remove('active');
    } else {
      if (statusEl) {
        statusEl.textContent = '白棋回合';
        statusEl.className = 'status-value';
      }
      if (blackCard) blackCard.classList.remove('active');
      if (whiteCard) whiteCard.classList.add('active');
    }
  }
}

/**
 * 更新玩家显示
 */
function updatePlayerDisplay() {
  // 可以在这里添加玩家信息更新逻辑
  updateTurnDisplay();
}

/**
 * 启动计时器
 */
function startTimer() {
  stopTimer();
  gameStartTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

/**
 * 停止计时器
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * 更新计时器显示
 */
function updateTimer() {
  const timeEl = document.getElementById('game-time');
  if (!timeEl) return;
  
  const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  timeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', initGameUI);

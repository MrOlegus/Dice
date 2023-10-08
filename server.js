//#region server
const md5 = require("md5");
const sync = require("sync-request");
const express = require("express");
const app = express();

const secret = "XNOkLeUFuOxTwMowAWr0jJzqsSUssL";
const ggame_id = 241331;
const port = 6111;

app.use(express.static(__dirname + "/public"))
.get("/", function (request, response) {
  if (request.query.test) {
    response.sendFile(__dirname + "/page/index.html");
    return;
  }

  console.log(`Новый запрос от ${request.query.user_id}`);

  let [user_id, room_id, battle_id, hash] = [
    request.query.user_id,
    request.query.room_id,
    request.query.battle_id,
    request.query.hash,
  ];

  let timestamp = Math.floor(Date.now() / 1000).toString();
  let res = sync("POST", "https://mindplays.com/api/v1/info_game", {
    json: {
      game_id: ggame_id,
      user_id: user_id,
      room_id: room_id,
      battle_id: battle_id,
      hash: md5(
        `${ggame_id}:${user_id}:${room_id}:${battle_id}:${timestamp}:${secret}`
      ),
      timestamp: timestamp,
    },
  });
  let user = JSON.parse(res.getBody("utf8")).data;
  user.amount = Number(user.amount);

  let game_id = `${room_id}:${battle_id}`;

  let game = games.get(game_id);
  if (game) {
    game.users.push(user);
  } else {
    let game = new Game();
    game.id = game_id;
    game.users = [user];
    game.goal = Number(user.game.attributes[0].option);
    game.time = 20;
    game.result = null;
    game.start = timestamp;
    game.isStarted = false;

    games.set(game_id, game);
  }

  response.sendFile(__dirname + "/page/index.html");
});

app.use(express.static(__dirname + "/page"));


let listener = app.listen(port);
//#endregion

//#region сокеты
const WebSocket = require("ws");
const wsServer = new WebSocket.Server({ server: listener });

wsServer.on("connection", (wsClient) => {
  wsClient.on("message", function (message) {
    let json = JSON.parse(message);
    switch (json.type) {
      case "hello":
        let game = games.get(json.data.game_id);
        if (game) {
          for(let i = 0; i < game.users.length; i++)
            if (game.users[i].user_id === json.data.user_id) {
              game.wsClients[i] = wsClient;
              break;
            }
        }
        break;
    }
  });

  wsClient.on("close", function () {});
});

//#endregion

//#region текущие игры
let games = new Map();
//#endregion

//#region game
class Game {
  /*
  id - уникальный идентификатор игры
    
  start - время начала игры
  isStarted - начата ли игра (true, false)
  
  wsClients - массив сокетов первого игрока
  
  users - массив инфы игроков
  
  goal - до скольки очков игра
  
  scores - массив счетов
  
  bolts - массив болтов
  
  order - порядок хода
  
  bank - текущие очки
  current - очки за последний бросок
  dice - кубиков на руках  
  time - оставшееся время на ход
  
  result - результат игры (null - в процессе, 0 - ничья, id - id выигранного игрока)
  
  orderRes - массив с результатами розыгрыща порядка ход
  throwRes - массив с результатами броска
  
  pending - статус игры (ожидание результата, ожидание действия)
  */

  constructor() {
    this.wsClients = [];
    this.scores = [0, 0];
    this.bolts = [0, 0];
    this.order = Math.floor(Math.random() * 2);
    
    // ЗАПУСК ИГРЫ
    let interval_id_1 = setInterval(() => {
      if (this.wsClients[0] && this.wsClients[1] && this.users[0] && this.users[1]) {
        this.isStarted = true;
        this.onStart();
      }
      if (this.isStarted) clearInterval(interval_id_1);
    }, 100);

    // ВРЕМЯ
    let interval_id_2 = setInterval(() => {
      if (this.isStarted && this.pending !== 'result') {
        this.time = Math.max(this.time - 1, 0);
        if (this.time <= 0) {
          this.result =
            this.order === 0
              ? this.users[1].user_id
              : this.users[0].user_id;
        }
        if (this.result !== null) clearInterval(interval_id_2);
      }
    }, 1000);

    // КОНТРОЛЬ РЕЗУЛЬТАТА
    let interval_id_3 = setInterval(() => {
      if (this.result !== null) {
        this.sendResult();
        clearInterval(interval_id_3);
        games.delete(this.id);
      }
    }, 100);

    // УСТАНОВКА РЕЗУЛЬТАТА
    let interval_id_4 = setInterval(() => {
      if (this.scores[0] >= this.goal) this.result = this.users[0].user_id;
      else if (this.scores[1] >= this.goal) this.result = this.users[1].user_id;

      if (this.result !== null) clearInterval(interval_id_4);
    }, 100);
    
    console.log("Игра создана");
  }

  getRandomArrays(n) {
    let res = [];
    for (let i = 0; i < n; i++)
      res.push([
        Math.random(),
        Math.random(),
        Math.random(),
        Math.random(),
        Math.random(),
        Math.random(),
        Math.random(),
      ]);
    return res;
  }

  move(dice) { 
    let c = [0, 0, 0, 0, 0, 0, 0];
    
    dice.forEach(d => c[d]++);
    if (c[1]+c[2]+c[3]+c[4]+c[5]+c[6] !== this.dice) return false;
      
    this.current = 0;
    
    if (c[1]===1 && c[2]===1 && c[3]===1 && c[4]===1 && c[5]===1) {
      this.current += 125;
      c[1]=c[2]=c[3]=c[4]=c[5]=0;
    } else
    if (c[2]===1 && c[3]===1 && c[4]===1 && c[5]===1 && c[6]===1) {
      this.current += 250;
      c[2]=c[3]=c[4]=c[5]=c[6]=0;
    } else
      
    if (c[1]===5) {
      this.current += 1000;
      c[1]=0;
    } else
    if (c[1]===4) {
      this.current += 200;
      c[1]=0;
    } else
    if (c[1]===3) {
      this.current += 100;
      c[1]=0;
    } else

    if (c[2]===5) {
      this.current += 200;
      c[2]=0;
    } else
    if (c[2]===4) {
      this.current += 40;
      c[2]=0;
    } else
    if (c[2]===3) {
      this.current += 20;
      c[2]=0;
    } else
      
    if (c[3]===5) {
      this.current += 300;
      c[3]=0;
    } else
    if (c[3]===4) {
      this.current += 60;
      c[3]=0;
    } else
    if (c[3]===3) {
      this.current += 30;
      c[3]=0;
    } else
      
    if (c[4]===5) {
      this.current += 400;
      c[4]=0;
    } else
    if (c[4]===4) {
      this.current += 80;
      c[4]=0;
    } else
    if (c[4]===3) {
      this.current += 40;
      c[4]=0;
    } else
      
    if (c[5]===5) {
      this.current += 500;
      c[5]=0;
    } else
    if (c[5]===4) {
      this.current += 100;
      c[5]=0;
    } else
    if (c[5]===3) {
      this.current += 50;
      c[5]=0;
    } else
      
    if (c[6]===5) {
      this.current += 600;
      c[6]=0;
    } else
    if (c[6]===4) {
      this.current += 120;
      c[6]=0;
    } else
    if (c[6]===3) {
      this.current += 60;
      c[6]=0;
    };
      
    this.current += 10 * c[1] + 5 * c[5];
    c[1] = c[5] = 0;
    
    this.bank += this.current;
    this.dice = c[1] + c[2] + c[3] + c[4] + c[5] + c[6];
    if (this.dice === 0) this.dice = 5;
    
    if (this.current === 0) {
      this.bolts[this.order]++;
      if (this.bolts[this.order] === 3) {
        this.scores[this.order] = Math.max(0, this.scores[this.order] - 50);
        this.bolts[this.order] = 0;
      }
      
      this.order = (this.order + 1) % this.users.length;
      this.dice = 5;
      this.current = 0;
      this.bank = 0;
    }
    
    this.time = 20;
    
    return true;
  }
  
  pass() {
    this.scores[this.order] += this.bank;
    
    // самосвал
    if (this.scores[this.order] === 555) this.scores[this.order] = 0;
    
    // обгон
    for(let i = 0; i < this.users.length; i++)
      if (this.scores[this.order] > this.scores[i] &&
          this.scores[this.order] - this.bank < this.scores[i])
        this.scores[i] = Math.max(0, this.scores[i] - 50);
    
    this.bank = 0;
    this.current = 0;
    this.time = 20;
    this.bolts[this.order] = 0;
    this.dice = 5;
    this.order = (this.order + 1) % this.users.length;
  }
  
  isCorrectMove() {
    return true;
  }
  
  isCorrectPass() {
    if (this.bank === 0) return false;
    
    const before = this.scores[this.order];
    const after = this.scores[this.order] + this.bank;
    
    if (before >= 500 && after < 600) return false;
    if (before >= 900 && after < 1000) return false;
    
    return true;
  }
  
  onStart() {
    this.scores = [0 , 0];
    this.bolts = [0, 0];
    this.bank = 0;
    this.dice = 5;
    this.current = 0;
    
    this.orderRes = [];
    this.moveRes = [];
    
    this.pending = 'action'; // ожидание действия

    // привязка сообщений
    this.wsClients[0].on("message", this.onMessage.bind(this));
    this.wsClients[1].on("message", this.onMessage.bind(this));
    
    // отключение = поражение
    this.wsClients[0].on("close", () => this.result = this.users[1].user_id);
    this.wsClients[1].on("close", () => this.result = this.users[0].user_id);
    
    // отправить имена и id-шники игрокам
    let json = JSON.stringify({
      type: "info",
      data: {
        names: this.users.map(u => u.user.name),
        users: this.users.map(u => u.user_id),
      },
    });
    this.wsClients[0].send(json);
    this.wsClients[1].send(json);
    console.log("Имена и id-шники отправлены");

    // отправлять данные игрокам
    setInterval(() => {
      let json = JSON.stringify({
        type: "update",
        data: {
          goal: this.goal,
          scores: this.scores,
          bolts: this.bolts,
          bank: this.bank,
          current: this.current,
          dice: this.dice,
          time: this.time,
          order: this.order,
          pending: this.pending
        }
      });
      this.wsClients[0].send(json);
      this.wsClients[1].send(json);
    }, 100);
  }

  onMessage(message) {
    let json = JSON.parse(message);
    let data = json.data;

    switch (json.type) {
      case "move": {
        if (json.data.user_id !== this.users[this.order].user_id) break;
        if (this.pending === 'result') break;
        if (!this.isCorrectMove()) break;
            
        let json2 = JSON.stringify({
          type: "move",
          data: {
            user_id: this.users[this.order],
            randoms: this.getRandomArrays(this.dice)
          }
        });
        this.pending = 'result'; // ожидание результата
        
        this.wsClients[0].send(json2);
        this.wsClients[1].send(json2);
        break;
      }
        
      case "result": {
        this.moveRes.push(json.data);
        if (this.moveRes.length < 2) break; 
        
        if(!this.move(this.moveRes[0].result)) {
          this.moveRes = [];
          this.pending = 'result';
          
          let json = JSON.stringify({
            type: "message",
            data: {
              message: `${this.users[this.order].user.name}, перебрось!`
            }
          });
          this.wsClients[0].send(json);
          this.wsClients[1].send(json);
        };
        
        this.moveRes = [];
        this.pending = 'action';
        break;
      }
        
      case "pass": {
        if (json.data.user_id !== this.users[this.order].user_id) break;
        if (this.pending === 'result') break;
        if (!this.isCorrectPass()) break;
        
        this.pass();
        break;
      }
    }
  }

  onClose(e) {
    console.log(e);
  }
  
  sendResult() {
    console.log("Отправляю результаты");

    let user_1 = this.users[0];
    let user_2 = this.users[1];
    let result = this.result;
    let timestamp = Math.floor(Date.now() / 1000).toString();

    let operation_type_1;
    switch (result) {
      case 0:
        operation_type_1 = 2;
        break;
      case user_1.user_id:
        operation_type_1 = 1;
        break;
      case user_2.user_id:
        operation_type_1 = 3;
        break;
    }
    let operation_type_2 = 4 - operation_type_1;

    let result_amount_1;
    switch (operation_type_1) {
      case 1:
        result_amount_1 = user_1.amount * 2;
        break;
      case 2:
        result_amount_1 = user_1.amount;
        break;
      case 3:
        result_amount_1 = 0;
        break;
    }
    let result_amount_2 = user_1.amount * 2 - result_amount_1;

    let operation_amount_1 = operation_type_1 === 2 ? 0 : user_1.amount;
    let operation_amount_2 = operation_type_2 === 2 ? 0 : user_2.amount;

    let json1 = {
      game_id: ggame_id,
      room_id: user_1.room_id,
      battle_id: user_1.battle_id,
      timestamp: timestamp,
      start_timestamp: this.start.toString(),
      finish_timestamp: timestamp,
      hash: md5(
        `${ggame_id}:${user_1.user_id}:${user_1.room_id}:${user_1.battle_id}:${timestamp}:${secret}`
      ),
      user_id: user_1.user_id,
      timestamp: timestamp,
      data: [
        {
          operation_type: operation_type_1,
          amount: operation_amount_1.toFixed(2),
          opponent_id: user_2.user_id,
          comment: "",
        },
      ],
      result_amount: result_amount_1.toFixed(2),
    };

    let res = sync("POST", "https://mindplays.com/api/v1/result_game", {
      json: json1,
    });

    let json2 = {
      game_id: ggame_id,
      room_id: user_2.room_id,
      battle_id: user_2.battle_id,
      timestamp: timestamp,
      start_timestamp: this.start.toString(),
      finish_timestamp: timestamp,
      hash: md5(
        `${ggame_id}:${user_2.user_id}:${user_2.room_id}:${user_2.battle_id}:${timestamp}:${secret}`
      ),
      user_id: user_2.user_id,
      timestamp: timestamp,
      data: [
        {
          operation_type: operation_type_2,
          amount: operation_amount_2.toFixed(2),
          opponent_id: user_1.user_id,
          comment: "",
        },
      ],
      result_amount: result_amount_2.toFixed(2),
    };

    res = sync("POST", "https://mindplays.com/api/v1/result_game", {
      json: json2,
    });
  }
}
//#endregion

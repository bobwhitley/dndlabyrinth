var labyrinth = {
    VERSION: 1.1,
    DIR_TYPE: {
        North: 0,
        East: 1,
        South: 2,
        West: 3
    },
    PATH_TYPE: {
        Undefined: 0,
        Open: 1,
        Wall: 2,
        Door: 3
    },
    GAME_STATE: {
        Wait: 0,
        WarriorOneSelectRoom: 1,
        WarriorTwoSelectRoom: 2,
        WarriorOneTurn: 3,
        WarriorTwoTurn: 4,
        GameOver: 5
    },
    DRAGON_STATE: {
        Asleep: 0,
        Awake: 1
    },
    settings: {
        debug: false,
        travelSpeed: 200,
        doorProb: .1,
        wallProb: .8,
        removeWallThreshold: 2,
        removeWallProb: 0,
        edgeWallBias: true,
        treasureRoomDistance: 3,
        maxLives: 3,
        baseMoves: 2,
        movesPerLife: 2,
        movesWithTreasure: 4,
        doorClosedProb: .2,
        dragonWakeDistance: 3,
        dragonFollows: 1
    },
    elements: {
        board: null,
        grid: null,
        buttons: [],
        chambers: [],
        help: null
    },
    maze: {
        chamberPaths: [],
        stack: null,
        visited: {},
        lastChamber: null,
        cancelTravel: false
    },
    game: {
        init: false,
        state: 0,
        delayTimeout: null,
        numberOfWarriors: 1,
        warrior: [
            {
                lives: null,
                secretRoom: null,
                position: null,
                moves: null
            },
            {
                lives: null,
                secretRoom: null,
                position: null,
                moves: null
            }
        ],
        dragon: {
            position: null,
            state: null,
            visible: false
        },
        treasure: {
            room: null,
            warrior: -1,
            visible: false
        },
        switchButtonOn: false,
        level: 1,
        help: null,
        helpTimeout: null,
        helpMessage: ""
    },
    audio: {
        on: new Audio("audio/on.mp3"),
        levelOne: new Audio("audio/levelOne.mp3"),
        levelTwo: new Audio("audio/levelTwo.mp3"),
        dragonFlying: new Audio("audio/dragonFlying.mp3"),
        defeat: new Audio("audio/defeat.mp3"),
        dragonAttacks: new Audio("audio/dragonAttacks.mp3"),
        dragonWakes: new Audio("audio/dragonWakes.mp3"),
        wall: new Audio("audio/wall.mp3"),
        door: new Audio("audio/door.mp3"),
        illegalMove: new Audio("audio/illegalMove.mp3"),
        warriorMoves: new Audio("audio/warriorMoves.mp3"),
        warriorOne: new Audio("audio/warriorOne.mp3"),
        winner: new Audio("audio/winner.mp3"),
        warriorTwo: new Audio("audio/warriorTwo.mp3"),
        treasure: new Audio("audio/treasure.mp3")
    },
    log(msg) {
        if (this.settings.debug) console.log(msg);
    },
    trackEvent(action, category, label, value) {
        if (window.gaEnabled) {
            try {
                gtag('event', action, {
                    'event_category': category,
                    'event_label': label,
                    'value': value
                });
            }
            catch (ex) { }
        }
    },
    startMessageResolve: null,
    serialAudio: new Audio(),
    audioPlayResolve: null,
    audioPlayTimeout: null,
    audioMetadataListener() {
        var duration = this.serialAudio.duration;
        var self = this;
        this.audioPlayTimeout = setTimeout(function() { 
            self.audioPlayTimeout = null;
            var resolve = self.audioPlayResolve;
            self.audioPlayResolve = null;
            resolve(); 
        }, duration * 1000);
    },
    playAudio(audio) {
        return new Promise((resolve, reject) => {
            if (this.audioPlayTimeout && this.audioPlayResolve) {
                var timeout = this.audioPlayTimeout;
                this.audioPlayTimeout = null;
                clearTimeout(timeout);
                var previousResolve = this.audioPlayResolve;
                this.audioPlayResolve = null;
                previousResolve();
            }
            this.audioPlayResolve = resolve;
            this.serialAudio.src = audio.src;
            this.serialAudio.play();
        });
    },
    init() {
        if (!window.URL || !window.Promise) {
            alert("Sorry! Your browser is not supported.");
        } 
        else {
            let location = new URL(document.location);
            if (location.searchParams.get("debug") == "1") this.settings.debug = true;
            let travelSpeed = location.searchParams.get("travelSpeed");
            if (!isNaN(parseInt(travelSpeed))) this.settings.travelSpeed = travelSpeed;
            if (this.settings.debug) {
                document.body.className = document.body.className + " debug";
                var container = document.getElementById("container");
                container.className = " layoutDebug";
                document.addEventListener("onclick", event => {
                    if (event.keyCode === 88) this.maze.cancelTravel = true;
                });
            }
            else {
                document.addEventListener("contextmenu", function(event){
                    event.preventDefault();
                }, false);
            }
            this.loadSettings();
            this.initMenus();
            this.initAudio();
            this.initStartMessage();
        }
    },
    loadSettings() {
        try {
            let helpEnabled = localStorage.getItem("helpEnabled");
            this.toggleHelp(helpEnabled == null || helpEnabled == "true");
        }
        catch(ex) {}
    },
    saveSetting(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch(ex) {}
    },
    toggleHelp(checked) {
        let helpCheckbox = document.getElementById("help");
        helpCheckbox.checked = checked;
        let helpMessage = document.getElementById("helpMessage");
        helpMessage.className = checked ? "show" : "";
        this.saveSetting("helpEnabled", checked);
    },
    initMenus() {
        var self = this;
        document.getElementById("exit").onclick = function() {
            self.trackEvent("Game Exit");
            document.body.className = document.body.className.replace(" play", "");
        };
        document.getElementById("reset").onclick = function() {
            self.trackEvent("Game Reset");
            self.reset.call(self);
        };
        document.getElementById("help").onclick = function() {
            self.trackEvent("Help " + (this.checked ? "Enabled" : "Disabled"));
            self.toggleHelp.call(self, this.checked);
        };
    },
    initStartMessage() {
        var self = this;
        document.getElementById("start").addEventListener("click", function() {
            self.trackEvent("Game Started");
            self.start.call(self);
        });
    },
    initAudio() {
        this.audioIndex = [
            [
                this.audio.dragonFlying,
                this.audio.dragonAttacks,
                this.audio.wall,
                this.audio.illegalMove,
                this.audio.warriorOne,
                this.audio.warriorTwo
            ],
            [
                this.audio.defeat,
                this.audio.dragonWakes,
                this.audio.door,
                this.audio.warriorMoves,
                this.audio.winner,
                this.audio.treasure
            ]
        ];
        this.audioNameIndex = [
            [
                "Dragon Flying",
                "Dragon Attacks",
                "Wall",
                "Illegal Move",
                "Warrior One",
                "Warrior Two"
            ],
            [
                "Defeat",
                "Dragon Wakes",
                "Door",
                "Warrior Moves",
                "Winner",
                "Treasure"
            ]
        ];
        var self = this;
        this.serialAudio.addEventListener("loadedmetadata", function () { 
            self.audioMetadataListener.call(self) 
        }, false);
    },
    reset() {
        this.initBoard();
        this.initMaze().then(() => {
            this.startGame();
        });
    },
    initBoard() {
        this.elements.help = document.getElementById("helpMessage");
        this.elements.board = document.getElementById("board");
        let board = this.elements.board;
        board.innerHTML = "";
        this.elements.grid = document.createElement("div");
        let grid = this.elements.grid
        grid.id = "grid";
        this.elements.buttons = [];
        this.elements.chambers = [];
        var chamberPaths = this.maze.chamberPaths;
        chamberPaths.splice(0);
        for(let r=0; r<8; r++) {
            chamberPaths.push([]);
            let row = document.createElement("div");
            row.className = "row";
            for(let c=0; c<9; c++) {
                let col = document.createElement("div");
                col.className = "col";
                let cell = document.createElement("div");
                cell.className = "cell";
                if (c == 0) {
                    var self = this;
                    col.id = "button-" + (r).toString();
                    col.className += " button";
                    if (r == 0) {
                        col.className += " switch";
                        var self = this;
                        col.onmousedown = function() {
                            self.toggleSwitch.call(self);
                        }
                    }
                    else if (r == 1) {
                        col.onmousedown = function(event) {
                            if (event.which == 1) {
                                self.nextTurn.call(self);
                            } else if (event.which == 3) {
                                self.toggleLevel.call(self);
                            }
                        }
                    }
                    else {
                        col.onmousedown = function(event) {
                            if (event.which == 1) {
                                self.playAudioClick.call(self, r-2, false);
                            } else if (event.which == 3) {
                                self.playAudioClick.call(self, r-2, true);
                            }
                        }
                    }
                }
                else {
                    chamberPaths[r].push([
                        r==0 ? this.PATH_TYPE.Wall : this.PATH_TYPE.Undefined, 
                        c==8 ? this.PATH_TYPE.Wall : this.PATH_TYPE.Undefined, 
                        r==7 ? this.PATH_TYPE.Wall : this.PATH_TYPE.Undefined,
                        c==1 ? this.PATH_TYPE.Wall : this.PATH_TYPE.Undefined 
                    ]);
                    col.id = "chamber-" + (r).toString() + "-" + (c-1).toString();
                    col.className += " chamber";
                    cell.onmousedown = function(event) {
                        self.chamberSelect([r, c-1], event);
                    }
                }
                if (c == 0) {
                    this.elements.buttons.push(col);
                }
                else {
                    if (c == 1) this.elements.chambers.push([]);
                    this.elements.chambers[this.elements.chambers.length - 1].push(col);
                    if (r < 7) {
                        let southWall = document.createElement("div");
                        southWall.className = "southWall";
                        col.appendChild(southWall);
                    }
                    if (c < 8) {
                        let eastWall = document.createElement("div");
                        eastWall.className = "eastWall";
                        col.appendChild(eastWall);
                    }
                }
                col.appendChild(cell);
                row.appendChild(col);
            }
            grid.appendChild(row);
        }
        board.appendChild(grid);
    },
    showSep(row, col, dir, type) {
        if (this.settings.debug) {
            var classSuffix = type == this.PATH_TYPE.Wall ? "WallDebug" : (type == this.PATH_TYPE.Door ? "DoorDebug" : "OpenDebug");
            var chamberCell = this.elements.chambers[row][col].querySelector(".cell");
            var classPrefix = "";
            if (dir == this.DIR_TYPE.North) classPrefix = "north";
            if (dir == this.DIR_TYPE.East) classPrefix = "east";
            if (dir == this.DIR_TYPE.South) classPrefix = "south";
            if (dir == this.DIR_TYPE.West) classPrefix = "west";
            chamberCell.className = chamberCell.className.replace(new RegExp("\\s" + classPrefix + "[^\\s]+"), "") + " " + classPrefix + classSuffix;
        }
    },
    setPath(row, col, dir, type) {
        var chamberPaths = this.maze.chamberPaths;
        chamberPaths[row][col][dir] = type;
        if (dir == this.DIR_TYPE.East || dir == this.DIR_TYPE.South) this.showSep(row, col, dir, type);
        if (dir == this.DIR_TYPE.North && row != 0) {
            chamberPaths[row - 1][col][this.DIR_TYPE.South] = type;
            this.showSep(row -1 , col, this.DIR_TYPE.South, type);
        } else if (dir == this.DIR_TYPE.East && col != 7) {
            chamberPaths[row][col + 1][this.DIR_TYPE.West] = type;
        } else if (dir == this.DIR_TYPE.South && row != 7) {
            chamberPaths[row + 1][col][this.DIR_TYPE.North] = type;
        } else if (dir == this.DIR_TYPE.West && col != 0) {
            chamberPaths[row][col - 1][this.DIR_TYPE.East] = type;
            this.showSep(row, col - 1, this.DIR_TYPE.East, type);
        }
    },
    getPaths(row, col) {
        var chamberPaths = this.maze.chamberPaths;
        return {
            north: chamberPaths[row][col][this.DIR_TYPE.North],
            east: chamberPaths[row][col][this.DIR_TYPE.East],
            south: chamberPaths[row][col][this.DIR_TYPE.South],
            west: chamberPaths[row][col][this.DIR_TYPE.West]
        }
    },
    wallOrNot() {
        return Math.random() <= this.settings.wallProb ? this.PATH_TYPE.Wall : this.openOrDoor();
    },
    openOrDoor() {
        return Math.random() <= this.settings.doorProb ? this.PATH_TYPE.Door : this.PATH_TYPE.Open;
    },
    travelMaze() {
        return new Promise((resolve, reject) => {
            var stack = this.maze.stack;
            var pos = stack[stack.length - 1];
            var wallProb = this.settings.wallProb;
            var visited = this.maze.visited;
            var chamberPaths = this.maze.chamberPaths;
            var row = pos[0];
            var col = pos[1];
            visited[row.toString() + "_" + col.toString()] = true;
            if (this.settings.debug) {
                var lastChamber = this.maze.lastChamber;
                var chamber = this.elements.chambers[row][col];
                if (chamber.className.indexOf("traveledDebug") == -1) chamber.className += " traveledDebug";
                chamber.className += " travelingDebug";
                if (lastChamber) lastChamber.className = lastChamber.className.replace(" travelingDebug", "");
                this.maze.lastChamber = chamber;
                var chamberCell = chamber.querySelector(".cell");
                if (chamberCell.innerHTML == "") chamberCell.innerHTML = stack.length;
            }
            if (this.settings.edgeWallBias && row > 0 && chamberPaths[row][col][this.DIR_TYPE.North] == this.PATH_TYPE.Undefined && visited[(row - 1).toString() + "_" + col.toString()]) {
                this.setPath(row, col, this.DIR_TYPE.North, this.wallOrNot(col == 0 || col == 11 ? 1 : wallProb)); // Bias for keeping walls near the left/right edges
            }
            if (this.settings.edgeWallBias && col < 7 && chamberPaths[row][col][this.DIR_TYPE.East] == this.PATH_TYPE.Undefined && visited[row.toString() + "_" + ((col + 1).toString()).toString()]) {
                this.setPath(row, col, this.DIR_TYPE.East, this.wallOrNot(row == 0 || row == 11 ? 1 : wallProb)); // Bias for keeping walls near the top/bottom edges
            }
            if (this.settings.edgeWallBias && row < 7 && chamberPaths[row][col][this.DIR_TYPE.South] == this.PATH_TYPE.Undefined && visited[(row + 1).toString() + "_" + col.toString()]) {
                this.setPath(row, col, this.DIR_TYPE.South, this.wallOrNot(col == 0 || col == 11 ? 1 : wallProb)); // Bias for keeping walls near the left/right edges
            }
            if (this.settings.edgeWallBias && col > 0 && chamberPaths[row][col][this.DIR_TYPE.West] == this.PATH_TYPE.Undefined &&  visited[row.toString() + "_" + ((col - 1).toString()).toString()]) {
                this.setPath(row, col, this.DIR_TYPE.West, this.wallOrNot(row == 0 || row == 11 ? 1 : wallProb)); // Bias for keeping walls near the top/bottom edges
            }
            var opts = [];
            var paths = this.getPaths(row, col);
            if (paths.north == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.North) 
            } else if (this.settings.edgeWallBias && row == 0 && paths.south == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.South); opts.push(this.DIR_TYPE.South); // Extra bias to turn south if at top
            }
            if (paths.east == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.East);
            } else if (this.settings.edgeWallBias && col == 7 && paths.west == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.West); opts.push(this.DIR_TYPE.West); // Extra bias to turn west if at right
            }
            if (paths.south == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.South);
            } else if (this.settings.edgeWallBias && row == 7 && paths.north == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.North); opts.push(this.DIR_TYPE.North); // Extra bias to turn north if at bottom
            }               
            if (paths.west == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.West);
            } else if (this.settings.edgeWallBias && col == 0 && paths.east == this.PATH_TYPE.Undefined) {
                opts.push(this.DIR_TYPE.East); opts.push(this.DIR_TYPE.East); // Extra bias to turn east if at left
            }   
            if (opts.length == 0) {
                if (this.settings.debug) {
                    var popRow = stack[stack.length - 1][0];
                    var popCol = stack[stack.length - 1][1];
                    var cell = this.elements.chambers[popRow][popCol].querySelector(".cell");
                    cell.innerHTML = "";
                }
                stack.pop();
            }
            else {
                var dir = opts[Math.floor(Math.random() * opts.length)]; 
                this.setPath(row, col, dir, this.openOrDoor());    
                stack.push([
                    row + (dir == this.DIR_TYPE.North ? -1 : (dir == this.DIR_TYPE.South ? 1 : 0)), 
                    col + (dir == this.DIR_TYPE.West ? -1 : (dir == this.DIR_TYPE.East ? 1 : 0))
                ]);
            }
            if (!this.maze.cancelTravel) {
                var self = this;
                if (stack.length > 0) {
                    if (this.settings.debug) {
                        setTimeout(function() { 
                            self.travelMaze.call(self).then(() => resolve()) 
                        }, this.settings.travelSpeed); 
                    }
                    else {
                        this.travelMaze().then(() => resolve());
                    } 
                }
                else {
                    resolve();
                }
            }
        });
    },
    removeWalls() {
        return new Promise((resolve, reject) => {
            if (this.settings.removeWallProb > 0 && this.settings.removeWallThreshold < 4) {
                var chamberPaths = this.maze.chamberPaths;
                for(let r=1; r<7; r++) {
                    for(let c=1; c<7; c++) {
                        var opts = [];
                        for(dir=0; dir<4; dir++) {
                            if (chamberPaths[r][c][dir] == this.PATH_TYPE.Wall) opts.push(dir);
                        }
                        if (opts.length >= this.settings.removeWallThreshold && Math.random() <= this.settings.removeWallProb) {
                            var removeDir = Math.floor(Math.random() * opts.length);
                            var type = this.openOrDoor();
                            this.setPath(r, c, opts[removeDir], type);
                        }
                    }
                }
            }
            resolve();
        });
    },
    initMaze() {
        return new Promise((resolve, reject) => {
            this.maze.stack = [[Math.floor(Math.random() * 8), Math.floor(Math.random() * 8)]];
            this.maze.visited = {};
            this.maze.lastChamber = null;
            this.maze.cancelTravel = false;
            let self = this;
            this.travelMaze().then(() => setTimeout(function() { 
                self.removeWalls.call(self).then(() => resolve());
            }, this.settings.travelSpeed));
        });
    },
    startGame() {
        this.game.level = 1
        this.game.numberOfWarriors = 1;
        this.game.warrior[0] = {
            lives: this.settings.maxLives,
            secretRoom: null,
            position: null,
            moves: null
        };
        this.game.warrior[1] = {
            lives: this.settings.maxLives,
            secretRoom: null,
            position: null,
            moves: null
        };
        this.game.treasure = {
            room: null,
            warrior: -1,
            visible: false
        }
        this.game.dragon = {
            position: null,
            state: this.DRAGON_STATE.Asleep,
            visible: false
        };
        this.selectWarriorRoom(0);
    },
    start() {
        document.body.className += " play";
        if (!this.game.init) {
            this.reset();
            this.game.init = true;
        }
    },
    toggleSwitch() {
        this.game.switchButtonOn = !this.game.switchButtonOn;
        this.elements.buttons[0].className = this.elements.buttons[0].className.replace(" selected", "");
        if (this.game.switchButtonOn) this.elements.buttons[0].className += " selected";
    },
    toggleSwitchOff() {
        if (this.game.switchButtonOn) {
            this.elements.buttons[0].className = this.elements.buttons[0].className.replace(" selected", "");
            this.game.switchButtonOn = false;
        }
    },
    toggleLevel() {
        this.game.level = this.game.level == 1 ? 2 : 1;
        let sound = this.game.level == 1 ? this.audio.levelOne : this.audio.levelTwo;
        this.help("Switched to game level " + (this.game.level == 1 ? "one (no doors)" : "two (with doors)"));
        this.playAudio(sound);
    },
    playAudioClick(index, secondary) {
        if (!secondary) secondary = this.game.switchButtonOn ? true : false;
        this.toggleSwitchOff();
        let message = "Playing sound \"" + this.audioNameIndex[secondary ? 1 : 0][index] + "\"";
        this.help(message, true, true);
        var timestamp = (new Date()).getTime();
        this.playAudio(this.audioIndex[secondary ? 1 : 0][index]).then(() => {
            let duration = (new Date()).getTime() - timestamp;
            if (duration < 1000) {
                var self = this;
                setTimeout(function() { self.resetHelpMessage.call(self); }, 1000 - duration);
            }
            else {
                this.resetHelpMessage();
            }
        });
    },
    numToText(warriorNumber, oneText, twoText) {
        return warriorNumber == 0 ? (oneText ? oneText : "one") : (twoText ? twoText : "two");
    },
    selectWarriorRoom(warriorNumber) {
        this.game.state = warriorNumber == 0 ? this.GAME_STATE.WarriorOneSelectRoom : this.GAME_STATE.WarriorTwoSelectRoom;
        this.playAudio(warriorNumber == 0 ? this.audio.warriorOne : this.audio.warriorTwo);
        this.help("Pick a secret room for warrior " + this.numToText(warriorNumber, "one", "two or tap \"Next Turn\" for a one player game"))
        this.log("Select secret room for warrior " + this.numToText(warriorNumber));

    },
    illegalWarriorRoom(warriorNumber) {
        this.log("No room selected for warrior "  + this.numToText(warriorNumber));
        this.help("Invalid secret room", true);
        this.playAudio(this.audio.illegalMove);
    },
    nextTurn() {
        if (this.game.switchButtonOn) {
            this.toggleSwitchOff();
            this.toggleLevel();
        }
        else {
            if (this.game.state == this.GAME_STATE.WarriorOneSelectRoom) {
                if (!this.game.warrior[0].secretRoom) {
                    this.illegalWarriorRoom(0);
                }
                else {
                    this.selectWarriorRoom(1);
                }
            } else if (this.game.state == this.GAME_STATE.WarriorTwoSelectRoom) {
                this.startTurns();
            } else if (this.game.state == this.GAME_STATE.WarriorOneTurn) {
                this.finishWarriorTurn(0);
            } else if (this.game.state == this.GAME_STATE.WarriorTwoTurn) {
                this.finishWarriorTurn(1);
            }
        }
    },
    startTurns() {
        document.body.className += " gameStarted";
        this.game.numberOfWarriors = this.game.warrior[1].secretRoom ? 2 : 1;
        this.log("Number of players: " + this.game.numberOfWarriors);
        this.setTreasureRoom();
        this.log("Treasure room at: " + this.game.treasure.room);
        this.warriorTurn(0);
    },
    warriorTurn(warriorNumber) {
        this.game.state = warriorNumber == 0 ? this.GAME_STATE.WarriorOneTurn : this.GAME_STATE.WarriorTwoTurn;
        let moves = this.resetWarriorMoves(warriorNumber)
        let message = "Warrior " + this.numToText(warriorNumber) + "'s turn with " + moves + " move" + (moves == 1 ? "" : "s");
        this.help(message);
        this.log(message);
        this.playAudio(warriorNumber == 0 ? this.audio.warriorOne : this.audio.warriorTwo);
    },
    illegalMove(warriorNumber, chamber) {
        this.help("Illegal move for warrior " + this.numToText(warriorNumber), true);
        this.log("Illegal move to " + chamber + " for warrior " + this.numToText(warriorNumber));
        this.playAudio(this.audio.illegalMove);
    },
    chamberSelect(chamber, event) {
        if (!this.game.delayTimeout) {
            var self = this;
            this.game.delayTimeout = setTimeout(function() { self.game.delayTimeout = null; }, 250);
            if (!this.audioPlayTimeout) {
                if (this.game.state == this.GAME_STATE.WarriorOneSelectRoom) {
                    this.setWarriorRoom(0, chamber);
                } else if (this.game.state == this.GAME_STATE.WarriorTwoSelectRoom) {
                    if (chamber[0] == this.game.warrior[0].secretRoom[0] && chamber[1] == this.game.warrior[0].secretRoom[1]) {
                        this.playAudio(this.audio.illegalMove);
                    }
                    else {
                        this.setWarriorRoom(1, chamber);
                    }
                } else if (this.game.state == this.GAME_STATE.WarriorOneTurn || this.game.state == this.GAME_STATE.WarriorTwoTurn) {
                    let warriorNumber = this.game.state == this.GAME_STATE.WarriorOneTurn ? 0 : 1;
                    this.warriorMoving(warriorNumber, chamber);
                } else if (this.game.state == this.GAME_STATE.GameOver) {
                    this.log("Ignoring selection since game is over");
                }
            }
        }
    },
    warriorMoving(warriorNumber, chamber) {
        if (this.settings.debug) {
            document.querySelectorAll(".treasureOptionDebug").forEach(function(optionChamber){
                optionChamber.className = optionChamber.className.replace(" treasureOptionDebug", "");
            });
            document.querySelectorAll(".treasureDebug").forEach(function(optionChamber){
                optionChamber.className = optionChamber.className.replace(" treasureDebug", "");
            });
        }
        let position = this.game.warrior[warriorNumber].position;
        let dir = this.getMoveDirection(this.game.warrior[warriorNumber].position, chamber);
        if (dir == null) {
            this.illegalMove(warriorNumber, chamber);
        }
        else {
            this.game.warrior[warriorNumber].moves--;
            let type = this.getPathType(position, dir);
            let warriorName = this.numToText(warriorNumber);
            if (type == this.PATH_TYPE.Wall) {
                let message = "Warrior " + warriorName + " moves into wall";
                this.help(message, true);
                this.log(message);
                this.renderWall(position, dir);
                this.playAudio(this.audio.wall).then(() => {
                    this.finishWarriorTurn(warriorNumber);
                });
            } else if (this.game.level == 2 && type == this.PATH_TYPE.Door) {
                if (Math.random() <= this.settings.doorClosedProb) {
                    let message = "Warrior " + warriorName + " moves into closed door";
                    this.help(message);
                    this.log(message);
                    this.playAudio(this.audio.door).then(() => {
                        this.finishWarriorTurn(warriorNumber);
                    });
                }
                else {
                    this.log("Warrior " + warriorName + " moves successfully thru door");
                    this.warriorMoved(warriorNumber, chamber);
                }
            } else {
                this.log("Warrior " + warriorName + " moves successfully");
                this.warriorMoved(warriorNumber, chamber);
            }
        }
    },
    warriorMoved(warriorNumber, chamber) {
        this.playAudio(this.audio.warriorMoves).then(() => {
            this.game.warrior[warriorNumber].position = chamber;
            this.renderWarriorPosition(warriorNumber);
            this.checkTreasureFound(warriorNumber).then(() => {
                if (this.game.treasure.warrior == warriorNumber && this.getDistance(chamber, this.game.warrior[warriorNumber].secretRoom) == 0) {
                    this.help("Warrior " + this.numToText(warriorNumber) + " wins!!");
                    this.log("Warrior " + this.numToText(warriorNumber) + " wins");
                    this.trackEvent("Game Won");
                    this.game.warrior[warriorNumber].moves = 0;
                    this.playAudio(this.audio.winner).then(() => {
                        this.game.state = this.GAME_STATE.GameOver;
                    });
                }
                else {
                    this.checkWarriorBattle().then(() => {
                        this.checkDragonWakes(warriorNumber).then(() => {
                            this.checkDragonAttacks().then((attacked) => {
                                if (attacked) {
                                    this.game.warrior[warriorNumber].moves = 0;
                                }
                                let remainingMoves = this.game.warrior[warriorNumber].moves;
                                if (remainingMoves == 0) {
                                    this.finishWarriorTurn(warriorNumber)
                                }
                                else {
                                    let message = "Warrior " + this.numToText(warriorNumber) + " has " + remainingMoves + " move" + (remainingMoves == 1 ? "" : "s") + " remaining";
                                    this.help(message);
                                    this.log(message);
                                };
                            });
                        });
                    });
                }
            });
        });
    },
    checkWarriorBattle() {
        return new Promise((resolve, reject) => {
            let bothWarriorsLive = this.game.numberOfWarriors == 2 && this.game.warrior[0].lives > 0 && this.game.warrior[1].lives > 0;
            if (bothWarriorsLive && this.game.treasure.warrior >=0 && this.getDistance(this.game.warrior[0].position, this.game.warrior[1].position) == 0) {
                this.log("Warriors battle for the treasure");
                let winner = Math.floor(Math.random() * 2);
                let message = "Warrior " + (winner == 0 ? "one" : "two") + " " + (winner == this.game.treasure.warrior ? "keeps" : "steals") + " the treasure";
                this.game.treasure.warrior = winner;
                this.help(message);
                this.log(message);
                this.playAudio(winner == 0 ? this.audio.warriorOne : this.audio.warriorTwo).then(() =>{
                    this.playAudio(this.audio.treasure).then(() =>{
                        resolve();
                    })
                })
            }
            else {
                resolve();
            }
        });
    },
    renderWall(position, dir) {
        if (this.getPathType(position, dir) == this.PATH_TYPE.Wall) {
            let wall = null;
            if (dir == this.DIR_TYPE.North && position[0] != 0) {
                wall = this.elements.chambers[position[0] - 1][position[1]].querySelector(".southWall");
            } else if (dir == this.DIR_TYPE.West && position[1] != 0) {
                wall = this.elements.chambers[position[0]][position[1] - 1].querySelector(".eastWall");
            } else if (dir == this.DIR_TYPE.South && position[0] != 7) {
                wall = this.elements.chambers[position[0]][position[1]].querySelector(".southWall");
            } else if (dir == this.DIR_TYPE.East && position[1] != 7) {
                wall = this.elements.chambers[position[0]][position[1]].querySelector(".eastWall");
            }
            if (wall) {
                wall.style.visibility = "visible";
            }
        }
    },
    finishWarriorTurn(currentWarrior) {
        if (this.game.state != this.GAME_STATE.GameOver) {
            if (currentWarrior == 0 && this.game.numberOfWarriors == 2 && this.game.warrior[1].lives > 0) {
                this.warriorTurn(1);
            }
            else {
                this.moveDragon().then(() => {
                    this.warriorTurn(this.game.warrior[0].lives > 0 ? 0 : 1);
                });
            }
        }
    },
    checkDragonWakes(warriorNumber) {
        return new Promise((resolve, reject) => {
            if (this.game.dragon.state == this.DRAGON_STATE.Asleep) {
                if (this.getDistance(this.game.warrior[warriorNumber].position, this.game.warrior[warriorNumber].secretRoom) != 0) {
                    let dragonDistance = this.getDistance(this.game.warrior[warriorNumber].position, this.game.dragon.position);
                    if (dragonDistance <= this.settings.dragonWakeDistance) {
                        this.help("Dragon awakes!");
                        this.log("Dragon awakes");
                        this.trackEvent("Dragon Awakes");
                        this.playAudio(this.audio.dragonWakes).then(() => {
                            this.help("");
                            this.game.dragon.state = this.DRAGON_STATE.Awake;
                            resolve();
                        });
                    }
                    else {
                        resolve();
                    }
                }
                else {
                    resolve();
                }
            }
            else {
                resolve();
            }
        });
    },
    unsafeWarriors: function() {
        let warriors = [];
        if (this.game.warrior[0].lives > 0 && !this.warriorSafe(0)) warriors.push(0);
        if (this.game.numberOfWarriors == 2 && this.game.warrior[1].lives > 0 && !this.warriorSafe(1)) warriors.push(1);
        return warriors;
    },
    moveDragon() {
        return new Promise((resolve, reject) => {
            if (this.game.dragon.state == this.DRAGON_STATE.Awake) {
                let dragonFlies = true;
                let moveTowards = null;
                let followWarrior = -1;
                if (this.game.treasure.warrior < 0) {
                    let warriors = this.unsafeWarriors();
                    if (warriors.length == 2) {
                        let warriorOneDistance = this.getDistance(this.game.dragon.position, this.game.warrior[0].position);
                        let warriorTwoDistance = this.getDistance(this.game.dragon.position, this.game.warrior[1].position);
                        followWarrior = warriorOneDistance < warriorTwoDistance ? 0 : (warriorOneDistance > warriorTwoDistance ? 1 : Math.floor(Math.random() * 2));
                    }
                    else {
                        followWarrior = warriors[0];
                    }
                }
                if (this.game.treasure.warrior >= 0) {
                    followWarrior = this.game.treasure.warrior;
                    let message = "Dragon follows treasure with warrior " + (followWarrior == 0 ? "one" : "two");
                    this.help(message, true);
                    this.log(message);
                    moveTowards = this.game.warrior[followWarrior].position;
                } else if (followWarrior >= 0) {
                    let message = "Dragon follows warrior " + (followWarrior == 0 ? "one" : "two");
                    if (this.game.dragon.visible) {
                        this.help(message, true);
                    }
                    else {
                        let warriorText = "closest warrior";
                        if (this.game.numberOfWarriors == 1 || this.game.warrior[1].lives == 0) {
                            warriorText = "warrior one";
                        }
                        else if (this.game.numberOfWarriors == 2 && this.game.warrior[0].lives == 0) {
                            warriorText = "warrior two";
                        }
                        this.help("Dragon follows " + warriorText, true);
                    }
                    this.log(message);
                    moveTowards = this.game.warrior[followWarrior].position;
                }
                else if (this.getDistance(this.game.dragon.position, this.game.treasure.room) > 0) {
                    this.log("Dragon returns towards treasure");
                    if (!this.game.treasure.visible) {
                        this.help("Dragon moves to an unknown location towards the treasure room", true);
                        this.log("Hiding dragon since the treasure room location is unknown");
                        this.game.dragon.visible = false;
                    }
                    else {
                        this.help("Dragon moves back towards the treasure room", true);
                    }
                    moveTowards = this.game.treasure.room;
                } else {
                    this.log("Dragon stays in treasure room");
                    if (!this.game.treasure.visible) {
                        this.game.dragon.visible = false;
                    }
                    dragonFlies = false;
                }
                if (dragonFlies) {
                    if (moveTowards) {
                        let lastPosition = this.game.dragon.position;
                        let moveY = Math.sign(moveTowards[0] - lastPosition[0]);
                        let moveX = Math.sign(moveTowards[1] - lastPosition[1]);
                        let newPosition = [
                            lastPosition[0] + moveY,
                            lastPosition[1] + moveX
                        ];
                        this.game.dragon.position = newPosition;
                        this.renderDragonPosition();
                    }
                    this.playAudio(this.audio.dragonFlying).then(() => {
                        this.checkDragonAttacks().then(() => {
                            resolve();
                        });
                    });
                }
                else {
                    resolve();
                }
            }
            else {
                resolve();
            }
        });
    },
    checkDragonAttacks() {
        return new Promise((resolve, reject) => {
            let warriors = this.unsafeWarriors();
            let self = this;
            let threatenedWarriors = [];
            warriors.forEach(function(warrior) {
                if (self.getDistance(self.game.dragon.position, self.game.warrior[warrior].position) == 0) threatenedWarriors.push(warrior);
            });
            let attackWarrior = threatenedWarriors.length == 1 ? threatenedWarriors[0] : -1;
            let multipleWarriors = threatenedWarriors.length == 2;
            if (multipleWarriors) {
                if (this.game.treasure.warrior >= 0) {
                    attackWarrior = this.game.treasure.warrior;
                }
                else {
                    attackWarrior = Math.floor(Math.random() * 2);
                }
            }
            if (attackWarrior >= 0 ) {
                this.dragonAttack(attackWarrior).then((attacked) => {
                    resolve(true);
                });
            }
            else {
                resolve(false);
            }
        });
    },
    dragonAttack(warriorNumber) {
        return new Promise((resolve, reject) => {
            let message = "Dragon attacks warrior " + this.numToText(warriorNumber);
            this.help(message);
            this.log(message);
            if (!this.game.dragon.visible) {
                this.game.dragon.visible = true;
                this.renderDragonPosition();
            }
            this.playAudio(warriorNumber == 0 ? this.audio.warriorOne : this.audio.warriorTwo).then(() => {
                this.completeAttack(warriorNumber).then(() => {
                    resolve();
                });
            });
        });
    }, 
    completeAttack(warriorNumber) {
        return new Promise((resolve, reject) => {
            if (this.game.treasure.warrior == warriorNumber) this.game.treasure.warrior = -1;
            this.playAudio(this.audio.dragonAttacks).then(() => {
                this.help("");
                this.renderTreasurePosition();
                this.removeLife(warriorNumber).then(() => {
                    resolve();
                })
            });
        });
    },
    removeLife(warriorNumber) {
        return new Promise((resolve, reject) => {
            this.game.warrior[warriorNumber].lives--;
            let lives = this.game.warrior[warriorNumber].lives;
            this.log("Warrior " + this.numToText(warriorNumber) + " has " + lives + " lives");
            if (lives < 1) {
                this.killWarrior(warriorNumber).then(() => {
                    resolve();
                });
            }
            else {
                this.help("Warrior " + this.numToText(warriorNumber) + " has " + lives + " lives left", true);
                var secretRoom = this.game.warrior[warriorNumber].secretRoom;
                this.game.warrior[warriorNumber].position = secretRoom;
                this.renderWarriorPosition(warriorNumber);
                resolve();
            }
        });
    },
    killWarrior(warriorNumber) {
        return new Promise((resolve, reject) => {
            let message = "Warrior " + this.numToText(warriorNumber) + " has been killed!";
            if (this.game.warrior[0].lives < 1 && (this.game.numberOfWarriors == 1 || this.game.warrior[1].lives < 1)) {
                this.game.state = this.GAME_STATE.GameOver;
                this.trackEvent("Game Lost");
            }
            this.trackEvent("Warrior Killed");
            this.help(message, true);
            this.log(message);
            this.playAudio(this.audio.defeat).then(() => {
                this.removeWarrior(warriorNumber);
                this.removeSecretRoom(warriorNumber);
                resolve();
            });
        });
    },
    checkTreasureFound(warriorNumber) {
        return new Promise((resolve, reject) => {
            let warriorPosition = this.game.warrior[warriorNumber].position;
            let treasureRoom = this.game.treasure.room;
            if (this.game.treasure.warrior < 0 && this.getDistance(warriorPosition, treasureRoom) == 0) {
                let message = "Warrior " + this.numToText(warriorNumber) + " found the treasure!";
                this.trackEvent("Treasure Found");
                this.help(message, true);
                this.log(message);
                this.game.warrior[warriorNumber].moves = 0;
                this.game.treasure.warrior = warriorNumber;
                this.game.treasure.visible = true;
                this.renderTreasureMarker();
                this.renderTreasurePosition();
                this.playAudio(this.audio.treasure).then(() => {
                    resolve();
                })
            }
            else {
                resolve();
            }
        });
    },
    renderTreasureMarker() {
        let treasureRoom = this.game.treasure.room;
        let treasureMarker = document.createElement("div");
        treasureMarker.className = "treasureRoom";
        let chamberElement = this.elements.chambers[treasureRoom[0]][treasureRoom[1]];
        chamberElement.appendChild(treasureMarker);
    },
    warriorSafe(warriorNumber) {
        return this.getDistance(this.game.warrior[warriorNumber].position, this.game.warrior[warriorNumber].secretRoom) == 0;
    },
    resetWarriorMoves(warriorNumber) {
        let moves = this.settings.movesPerLife + (this.game.warrior[warriorNumber].lives * this.settings.movesPerLife);
        if (this.game.treasure.warrior == warriorNumber) moves = this.settings.movesWithTreasure;
        this.game.warrior[warriorNumber].moves = moves;
        return moves;
    },
    getMoveDirection(startPos, nextPos) {
        let dir = null;
        let distance = this.getDistance(startPos, nextPos);
        if (distance == 1) {
            let y = startPos[0] - nextPos[0];
            let x = startPos[1] - nextPos[1];
            if (y == 1) {
                dir = this.DIR_TYPE.North;
            } else if (y == -1) {
                dir = this.DIR_TYPE.South;
            } else if (x == 1) {
                dir = this.DIR_TYPE.West;
            } else if (x == -1) {
                dir = this.DIR_TYPE.East;
            }
        }
        return dir;
    },
    getPathType(position, dir) {
        return this.maze.chamberPaths[position[0]][position[1]][dir];
    },
    setWarriorRoom(warriorNumber, chamber) {
        this.help("Pick a different room or tap \"Next Turn\"");
        this.log("Secret room for warrior " + this.numToText(warriorNumber) + " is " + chamber.toString());
        if (this.settings.debug) {
            document.querySelectorAll(".traveledDebug,.travelingDebug").forEach(function(chamber) { 
                chamber.className = chamber.className.replace(" traveledDebug", "").replace(" travelingDebug", "");
            });
            var container = document.querySelector("#container:not(.layoutDebug)");
            if (container) container.className += " layoutDebug";
        }
        this.playAudio(this.audio.warriorMoves);
        this.removeSecretRoom(warriorNumber);
        let markerClass = "secretRoom" + this.numToText(warriorNumber, "One", "Two");
        let warriorMarker = document.createElement("div");
        warriorMarker.className = markerClass;
        let chamberElement = this.elements.chambers[chamber[0]][chamber[1]];
        chamberElement.appendChild(warriorMarker);
        this.game.warrior[warriorNumber].secretRoom = chamber;
        this.game.warrior[warriorNumber].position = chamber;
        this.renderWarriorPosition(warriorNumber);
    },
    removeSecretRoom(warriorNumber) {
        let secretRoom = this.game.warrior[warriorNumber].secretRoom;
        let markerClass = "secretRoom" + this.numToText(warriorNumber, "One", "Two");
        if (secretRoom) {
            let chamberElement = this.elements.chambers[secretRoom[0]][secretRoom[1]];
            let warriorMarker = chamberElement.querySelector("." + markerClass);
            if (warriorMarker) {
                chamberElement.removeChild(warriorMarker);
            }
        }
    },
    renderWarriorPosition(warriorNumber) {
        this.removeWarrior(warriorNumber);
        let name = "warrior" + this.numToText(warriorNumber, "One", "Two");
        let position = this.game.warrior[warriorNumber].position;
        let warriorMarker = document.createElement("div");
        warriorMarker.id = name;
        warriorMarker.className = name;
        warriorMarker.style.zIndex = (position[0] * 100) + warriorNumber + 1;
        let chamberElement = this.elements.chambers[position[0]][position[1]];
        chamberElement.appendChild(warriorMarker);
        if (this.game.treasure.warrior == warriorNumber) this.renderTreasurePosition();
    },
    removeWarrior(warriorNumber) {
        let name = "warrior" + this.numToText(warriorNumber, "One", "Two");
        let warriorElement = document.getElementById(name);
        if (warriorElement) {
            warriorElement.parentNode.removeChild(warriorElement);
        }
    },
    renderDragonPosition() {
        let dragonElement = document.getElementById("dragon");
        if (dragonElement) {
            dragonElement.parentNode.removeChild(dragonElement);
        }
        if (this.game.dragon.visible || this.settings.debug) {
            let position = this.game.dragon.position;
            let dragonMarker = document.createElement("div");
            dragonMarker.id = "dragon";
            dragonMarker.className = "dragon";
            dragonMarker.style.zIndex = (position[0] * 100) + 4;
            let chamberElement = this.elements.chambers[position[0]][position[1]];
            chamberElement.appendChild(dragonMarker);
        }
    },
    renderTreasurePosition() {
        if (this.game.treasure.visible || this.settings.debug) {
            let treasureElement = document.getElementById("treasure");
            if (treasureElement) {
                treasureElement.parentNode.removeChild(treasureElement);
            }
            let withWarrior = this.game.treasure.warrior >= 0;
            let position = this.game.treasure.room;
            if (withWarrior) {
                position = this.game.warrior[this.game.treasure.warrior].position;
            }
            let treasureMarker = document.createElement("div");
            treasureMarker.id = "treasure";
            treasureMarker.className = "treasure" + (withWarrior ? " withWarrior" : "");
            treasureMarker.style.zIndex = (position[0] * 100) + 3;
            let chamberElement = this.elements.chambers[position[0]][position[1]];
            chamberElement.appendChild(treasureMarker);
        }
    },
    setTreasureRoom() {
        let opts = [];
        for(let row=0; row<8; row++) {
            for(let col=0; col<8; col++) {
                if (this.getDistance([row,col], this.game.warrior[0].secretRoom) > this.settings.treasureRoomDistance) {
                    if (this.game.numberOfWarriors == 1 || this.getDistance([row,col], this.game.warrior[1].secretRoom) > this.settings.treasureRoomDistance) {
                        opts.push([row,col]);
                        if (this.settings.debug) this.elements.chambers[row][col].className += " treasureOptionDebug";
                    }
                }
            }
        }
        let treasurePos = this.game.treasure.room = opts[Math.floor(Math.random() * opts.length)];
        if (this.settings.debug) this.elements.chambers[treasurePos[0]][treasurePos[1]].className += " treasureDebug";
        this.game.treasure.room = treasurePos;
        this.game.dragon.position = treasurePos;
        if (this.settings.debug) {
            this.renderDragonPosition();
            this.renderTreasurePosition();
        }
    },
    getDistance(posA, posB) {
        return Math.abs(posA[0] - posB[0]) + Math.abs(posA[1] - posB[1]);
    },
    help(message, temporary, skipTimeout) {
        if (!temporary) {
            this.game.helpMessage = message;
        }
        if (temporary || !this.game.helpTimeout) {
            this.elements.help.innerText = message;
            if (temporary && !skipTimeout) {
                if (this.game.helpTimeout) clearTimeout(this.game.helpTimeout);
                var self = this;
                this.game.helpTimeout = setTimeout(function() {
                    self.game.helpTimeout = null;
                    self.resetHelpMessage.call(self);
                }, 2500);
            }
        }
    },
    resetHelpMessage() {
        this.elements.help.innerText = this.game.helpMessage;
    }
} 
window.addEventListener('DOMContentLoaded', (event) => { labyrinth.init() });

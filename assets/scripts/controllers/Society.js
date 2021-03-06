require('../../ykl/global');
var Group = require('Group');
var Wish = require('../Wish');
var BattlePanel = require('BattlePanel');
var FXRitual = require('FXRitual');
var GameOverPanel = require('GameOverPanel');
var AssetMng = require('AssetMng');
var AudioMng = require('AudioMng');
var Narrative = require('Narrative');

var wishTypeList = cc.Enum.getList(WishType);
var Wishes = {};
var PopulationLevel = [3, 8, 20, 35, 50];
var Levels = {};
for (var i = 0; i < wishTypeList.length; ++i) {
    var id = wishTypeList[i].value;
    Wishes[id] = new Wish();
    Wishes[id].id = id;
    Levels[PopulationLevel[i]] = id;
}

function createRitual (pose, id) {
    return {
        id: id,
        pose: pose,
        count: 0,
        level: 0
    };
}

var Society = cc.Class({
    extends: cc.Component,

    properties: {
        // Unlearnt Wishes
        wishes: {
            default: [],
            type: [Wish],
        },

        // Root node to host all people
        host: {
            default: null,
            type: cc.Node
        },

        battlePanel: {
            default: null,
            type: BattlePanel
        },

        fxRitual: {
            default: null,
            type: FXRitual,
        },

        gameOver: {
            default: null,
            type: GameOverPanel
        },

        assetMng: {
            default: null,
            type: AssetMng
        },

        narrative: Narrative,

        // Decide when to ask
        prayDelay: 20,

        // Decide the possibility to lost people
        lostCoef: 1,

        prayCoef: 0.3,

        rollWishCoef: 1.3,

        // Decide when to learn, +- 1 floating
        learnDelay: 10,

        // Population
        population: 0,
    },

    pause: function () {
        this._pause = true;
        this.node.emit('pause');
    },

    resume: function () {
        this._pause = false;
        this.node.emit('resume');
    },

    // use this for initialization
    onLoad: function () {
        this.rituals = {};
        this.ritualCount = 0;
        this.lastRitualID = 0;

        this.firstWishPop = false;

        this._pause = true;

        this._nextWish = null;

        this.god = this.getComponent('God');

        // People who do nothing
        this.defaultGroup = new Group(this);
        // People who is learning the learningSkill
        this.learningGroup = new Group(this);
        // All running groups which is not in default state
        this.runningGroups = [];

        this.prayTimeout = this.prayDelay;
        this.learnTimeout = this.learnDelay;

        // AudioMng.instance.playBGM();

        this.assetMng.init(function () {
            for (var i = 0; i < wishTypeList.length; ++i) {
                var id = wishTypeList[i].value;
                let wishInfo = this.assetMng.wishesDB[id];
                Wishes[id].poseCount = parseInt(wishInfo.poseCount);
                Wishes[id].poseDuration = parseInt(wishInfo.poseDuration);
                Wishes[id].moveSpeed = parseInt(wishInfo.moveSpeed);
                Wishes[id].ritualNeed = parseInt(wishInfo.ritualNeed);
                Wishes[id].tributePerP = parseInt(wishInfo.tributePerP);
                Wishes[id].divineConsume = parseInt(wishInfo.divineConsume);
                Wishes[id].wishConsume = parseInt(wishInfo.wishConsume);
                Wishes[id].levelBonus = parseInt(wishInfo.levelBonus);
                Wishes[id].attraction = parseInt(wishInfo.attraction);
            }
        }.bind(this));
    },

    wishCheck: function (group, wishID) {
        if (group.isLearning() && group.wish && group.wish.id === wishID) {
            var i, people = group.people, 
                poses = {}, behavior, pose, max = 1, pickedPose;
            for (i = 0; i < people.length; ++i) {
                behavior = people[i].getComponent('HumanBehavior');
                if (!behavior.checked) {
                    continue;
                }
                pose = behavior.currentPose;
                if (poses[pose]) {
                    poses[pose] ++;
                    if (poses[pose] > max) {
                        max = poses[pose];
                        pickedPose = pose;
                    }
                }
                else {
                    poses[pose] = 1;
                }
            }
            // Ritual need satisfied
            var wish = group.wish;
            if (pickedPose && max >= wish.ritualNeed) {
                setTimeout(function() {
                    let poseID = Poses.indexOf(pickedPose);
                    this.fxRitual.playAnim(poseID);
                }.bind(this), 2.5 * 1000);
                AudioMng.instance.playRitual();
                this.ritualLearnt(wish, pickedPose);
                this.tribute(max * wish.wishConsume, wish);
                group.toState(States.WORSHIPING, pickedPose);
            }
        }
        else if (group.isPraying() && group.prayRitual === this.rituals[wishID].pose) {
            this.tribute(group.people.length * Wishes[wishID].wishConsume, Wishes[wishID]);
            group.toState(States.WORSHIPING);
        }
        else if (group.wish) {
            // Force update pose
            group.punish();
        }
    },

    skillFired: function (wishID) {
        this.wishCheck(this.learningGroup, wishID);

        for (var i = 0; i < this.runningGroups.length; ++i) {
            var group = this.runningGroups[i];
            this.wishCheck(group, wishID);
        }
    },

    tribute: function (resources, wish) {
        this.god.tribute(resources);
        var newbies = Math.round(wish.attraction + Math.random() * 2 - 1);
        this.getComponent('generator').generate(newbies);
        AudioMng.instance.playBaby();

        // Upgrade rituals
        var ritual = this.rituals[wish.id];
        ritual.count ++;
        let lastLevel = ritual.level;
        ritual.level = Math.floor(ritual.count / 3);
        if (ritual.level > lastLevel) {
            this.god.showWonder(ritual.id);
        }
    },

    updatePopulation: function () {
        this.battlePanel.people.string = this.population;
        var max, count;
        for (var i = 0; i < PopulationLevel.length; ++i) {
            count = PopulationLevel[i];
            if (this.population >= count && Levels[count]) {
                max = count;
                id = Levels[count];
            }
            else if (this.population < count) {
                break;
            }
        }
        if (max) {
            var unlocked = this.battlePanel.unlockBtn(Levels[max]);
            unlocked && this.newSkillsAvailable(unlocked);
        }
    },

    newSkillsAvailable: function (skills) {
        for (var i = 0; i < skills.length; ++i) {
            var id = skills[i];
            if (Wishes[id]) {
                this.wishes.push(Wishes[id]);
            }
        }
    },

    startLearning: function () {
        if (this.learningGroup.isLearning()) {
            this.learningGroup.toState(States.LEARNING);
        }
    },

    learn: function () {
        if (this.firstWishPop === false) {
            this.firstWishPop = true;
            this.scheduleOnce(function() {
                this.narrative.playLine(2);
            }, 1);
        }
        for (var i = 0; i < this.wishes.length; ++i) {
            var wish = this.wishes[i];
            this.learningGroup.reuse(this);
            var delay = 2 + Math.random() * 2;
            var succeed = this.defaultGroup.split(wish, this.learningGroup);
            if (succeed) {
                this.learningGroup.wish = wish;
                this.learningGroup.learning = true;
                this.scheduleOnce(this.startLearning, delay);
                break;
            }
        }
    },

    ritualLearnt: function (wish, pose) {
        this.rituals[wish.id] = createRitual(pose, this.lastRitualID);
        this.lastRitualID++;
        this.ritualCount = Object.keys(this.rituals).length;
        this.prayTimeout = this.prayDelay;
        var index = this.wishes.indexOf(wish);
        if (index !== -1) {
            this.wishes.splice(index, 1);
        }
        index = UnusedPoses.indexOf(pose);
        if (index > -1) {
            UnusedPoses.splice(index, 1);
        }
        var btnRituals = this.battlePanel.btnRituals;
        if (!btnRituals.active) {
            btnRituals.active = true;
            btnRituals.runAction(cc.fadeIn(1));
        }
        this.battlePanel.rituals.activateRitual(wish.id, Poses.indexOf(pose));
    },

    rejointDefault: function (group) {
        var defaultGroup = this.defaultGroup;
        group.people.forEach((person) => {
            defaultGroup.addMember(person);
        });
        if (group === this.learningGroup) {
            group.unuse();
        }
        else {
            var index = this.runningGroups.indexOf(group);
            if (index >= 0) {
                this.runningGroups.splice(index, 1);
            }
            cc.pool.putInPool(group);
        }
    },

    lost: function (count) {
        this.population -= count;
        this.updatePopulation();
        if (this.population < 3) {
            this.gameOver.node.active = true;
        }
    },

    // called every frame, uncomment this function to activate update callback
    update: function (dt) {
        if (this._pause) {
            return;
        }

        // Learn new skill if possible
        if (this.wishes.length > 0 && !this.learningGroup.learning) {
            if (this.learnTimeout <= 0 || this.ritualCount === 0) {
                this.learnTimeout = this.learnDelay;
                this.learn();
            }
            this.learnTimeout -= dt;
        }
        if (this.learningGroup.active) {
            this.learningGroup.update(dt);
        }
        // Pray with ritual
        var group;
        if (this.ritualCount > 0) {
            // Ready for praying
            if (this.prayTimeout <= 0) {
                this.prayTimeout = this.prayDelay;
                if (this._nextWish === null) {
                    var knownWishes = Object.keys(this.rituals);
                    var count = knownWishes.length;
                    var rand = Math.random() * this.rollWishCoef;
                    var unit = rand / count;
                    var bouns = (this.rollWishCoef - 1) / (count * (count-1) / 2);
                    var range = 0;
                    var rolled = 0;
                    for (let i = 0; i < knownWishes.length; ++i) {
                        range += unit + bouns * i;
                        if (rand < range) {
                            rolled = i;
                            break;
                        }
                    }
                    var wishID = knownWishes[rolled];
                    this._nextWish = Wishes[wishID];
                }
                group = cc.pool.hasObject(Group) ? cc.pool.getFromPool(Group) : new Group(this);
                var succeed = this.defaultGroup.split(this._nextWish, group);
                if (succeed) {
                    group.wish = this._nextWish;
                    group.praying = true;
                    this.runningGroups.push(group);
                    group.toState(States.PRAYING);
                    this._nextWish = null;
                }
            }
            this.prayTimeout -= dt;
        }

        for (let i = 0; i < this.runningGroups.length; ++i) {
            group = this.runningGroups[i];
            if (group.active) {
                group.update(dt);
            }
        }
    },
});

Society.Wishes = Wishes;


require('../../ykl/global');
var Group = require('Group');
var Wish = require('../Wish');
var MainPanel = require('MainPanel');

var wishTypeList = cc.Enum.getList(WishType);
var Wishes = {};
for (var i = 0; i < wishTypeList.length; ++i) {
    var id = wishTypeList[i].value;
    Wishes[id] = new Wish();
    Wishes[id].id = id;
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

        mainPanel: {
            default: null,
            type: MainPanel
        },

        // Decide when to ask
        askCoef: 0,
        
        // Decide the possibility to lost people
        lostCoef: 1,

        // Decide when to learn, +- 1 floating
        learnDelay: 1,

        // Population
        population: 0,
    },

    // use this for initialization
    onLoad: function () {
        this.rituals = {};
        
        this.god = this.getComponent('God');
        
        // People who do nothing
        this.defaultGroup = new Group(this);
        // People who is learning the learningSkill
        this.learningGroup = new Group(this);
        // All running groups which is not in default state
        this.runningGroups = [];
    },

    skillFired: function (wishID) {
        if (!this.learningGroup.isLearning()) {
            return;
        }

        // Learning process
        if (this.learningGroup.wish.id === wishID) {
            var i, people = this.learningGroup.people, 
                poses = {}, person, pose, max = 1, pickedPose;
            for (i = 0; i < people.length; ++i) {
                person = people[i];
                pose = person.getComponent('HumanBehavior').currentPose;
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
            if (pickedPose && max >= this.learningGroup.wish.ritualNeed) {
                this.learningGroup.toState(States.WORSHINPING, pickedPose);
                this.vitualLearnt(wishID, pickedPose);
            }
        }
        else {
            // Force update pose
            this.learningGroup.countdown = 0;
        }
    },

    tribute: function (resources) {

    },

    newSkillsAvailable: function (skills) {
        for (var i = 0; i < skills.length; ++i) {
            var name = skills[i];
            if (Wishes[name]) {
                this.wishes.push(Wishes[name]);
            }
        }
    },

    startLearning: function () {
        if (this.learningGroup.isLearning()) {
            this.learningGroup.toState(States.LEARNING);
        }
    },

    learn: function () {
        for (var i = 0; i < this.wishes.length; ++i) {
            var wish = this.wishes[i];
            this.learningGroup.reuse(this);
            var delay = this.learnDelay - 1 + Math.random() * 2;
            var succeed = this.defaultGroup.split(wish, this.learningGroup);
            if (succeed) {
                this.learningGroup.wish = wish;
                this.scheduleOnce(this.startLearning, delay);
                break;
            }
        }
    },

    vitualLearnt: function (wish, pose) {
        this.rituals[wish.id] = pose;
        var index = this.wishes.indexOf(wish);
        if (index !== -1) {
            this.wishes.splice(index, 1);
        }
        index = UnusedPoses.indexOf(pose);
        if (index > -1) {
            UnusedPoses.splice(index, 1);
        }
    },

    rejointDefault: function (group) {
        var defaultGroup = this.defaultGroup;
        group.people.forEach((person) => {
            defaultGroup.addMember(person);
        });
        if (group === this.learningGroup) {
            group.reuse(this);
        }
        else {
            cc.pool.putInPool(group);
        }
    },

    lost: function (count) {
        this.population -= count;
        this.mainPanel.people.string = this.population;
    },

    // called every frame, uncomment this function to activate update callback
    update: function (dt) {
        // Learn new skill if possible
        if (this.wishes.length > 0 && !this.learningGroup.isLearning()) {
            this.learn();
        }
        if (this.learningGroup.isLearning()) {
            this.learningGroup.update(dt);
        }
        for (var i = 0; i < this.runningGroups.length; ++i) {
            var group = this.runningGroups[i];
            // switch (group.)
        }
    },
});

Society.Wishes = Wishes;


export const WASTELANDERS = {
  supportedLinks: {
    species: {
      feat: "feats"
    }
  },
  linkedForeign: {
    species: ["feats"],
  },
  attributes: {
    strength: "WASTELANDERS.Actor.Character.Attribute.Strength",
    perception: "WASTELANDERS.Actor.Character.Attribute.Perception",
    endurance: "WASTELANDERS.Actor.Character.Attribute.Endurance",
    attractiveness: "WASTELANDERS.Actor.Character.Attribute.Attractiveness",
    intelligence: "WASTELANDERS.Actor.Character.Attribute.Intelligence",
    dexterity: "WASTELANDERS.Actor.Character.Attribute.Dexterity",
    luck: "WASTELANDERS.Actor.Character.Attribute.Luck",
  },
  skills: {
    none: "",
    athletics: "WASTELANDERS.Actor.Character.Skill.Athletics",
    thievery: "WASTELANDERS.Actor.Character.Skill.Thievery",
    marksmanship: "WASTELANDERS.Actor.Character.Skill.Marksmanship",
    dueling: "WASTELANDERS.Actor.Character.Skill.Dueling",
    medicine: "WASTELANDERS.Actor.Character.Skill.Medicine",
    mechanics: "WASTELANDERS.Actor.Character.Skill.Mechanics",
    knowledge: "WASTELANDERS.Actor.Character.Skill.Knowledge",
    survival: "WASTELANDERS.Actor.Character.Skill.Survival",
    manipulation: "WASTELANDERS.Actor.Character.Skill.Manipulation",
    intimidation: "WASTELANDERS.Actor.Character.Skill.Intimidation",
  },
  skillLevels: {
    0: "",
    6: "WASTELANDERS.Actor.Character.SkillLevels.Student",
    8: "WASTELANDERS.Actor.Character.SkillLevels.Assistant",
    10: "WASTELANDERS.Actor.Character.SkillLevels.Master",
  },
  rollAdvantage: {
    0: "",
    1: "WASTELANDERS.Roll.Advantage",
    "-1": "WASTELANDERS.Roll.Disadvantage",
    2: "WASTELANDERS.Roll.DoubleAdvantage",
    "-2": "WASTELANDERS.Roll.DoubleDisadvantage",
  },
  enemyType: {
    statistician: "WASTELANDERS.Actor.Enemy.Types.Statistician",
    ordinary: "WASTELANDERS.Actor.Enemy.Types.Ordinary",
    elite: "WASTELANDERS.Actor.Enemy.Types.Elite",
    boss: "WASTELANDERS.Actor.Enemy.Types.Boss",
  },
};

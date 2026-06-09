/**
 * QuestLog - Overlay showing all quests organized by Career Zone.
 */
import React, { useMemo, useState } from 'react';
import questsData from '../../data/quests.json';
import './QuestLog.css';

function QuestLog({ activeQuests = [], completedQuests = [], onClose, onActivateQuest }) {
  const [filter, setFilter] = useState('all');

  const questsByZone = useMemo(() => {
    const byZone = {};
    for (const quest of questsData) {
      if (!byZone[quest.careerZone]) byZone[quest.careerZone] = [];

      const isActive = activeQuests.some(q => (q.questId || q.id) === quest.id);
      const isCompleted = completedQuests.some(q => (q.questId || q.id) === quest.id);
      const activeData = activeQuests.find(q => (q.questId || q.id) === quest.id);

      byZone[quest.careerZone].push({
        ...quest,
        status: isCompleted ? 'completed' : isActive ? 'active' : 'available',
        completedTasks: activeData ? activeData.completedTasks || [] : [],
      });
    }
    return byZone;
  }, [activeQuests, completedQuests]);

  const filteredZones = useMemo(() => {
    if (filter === 'all') return questsByZone;
    const filtered = {};
    for (const [zone, quests] of Object.entries(questsByZone)) {
      const matching = quests.filter(q => q.status === filter);
      if (matching.length > 0) filtered[zone] = matching;
    }
    return filtered;
  }, [questsByZone, filter]);

  const zoneLabels = {
    'tech-hub': 'Technology Hub',
    'engineering-quad': 'Engineering Quad',
    'science-park': 'Science Park',
    'health-sciences': 'Health Sciences',
    'creative-stem': 'Creative STEM',
  };

  return (
    <div className="quest-log-overlay" role="dialog" aria-label="Quest Log">
      <div className="quest-log">
        <div className="quest-log__header">
          <h2>Quest Log</h2>
          <button onClick={onClose} className="quest-log__close" aria-label="Close quest log">✕</button>
        </div>

        <div className="quest-log__filters" role="tablist">
          {['all', 'active', 'available', 'completed'].map(f => (
            <button
              key={f}
              className={`quest-log__filter ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
              role="tab"
              aria-selected={filter === f}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="quest-log__content" role="tabpanel">
          {Object.entries(filteredZones).map(([zone, quests]) => (
            <div key={zone} className="quest-log__zone">
              <h3 className="quest-log__zone-title">{zoneLabels[zone] || zone}</h3>
              {quests.map(quest => (
                <div key={quest.id} className={`quest-log__quest quest-log__quest--${quest.status}`}>
                  <div className="quest-log__quest-header">
                    <span className="quest-log__quest-type">{quest.type}</span>
                    <span className={`quest-log__quest-status quest-log__quest-status--${quest.status}`}>
                      {quest.status}
                    </span>
                  </div>
                  <h4 className="quest-log__quest-title">{quest.title}</h4>
                  <p className="quest-log__quest-desc">{quest.description}</p>
                  <div className="quest-log__tasks">
                    {quest.tasks.map(task => (
                      <div
                        key={task.id}
                        className={`quest-log__task ${quest.completedTasks.includes(task.id) ? 'completed' : ''}`}
                      >
                        <span className="quest-log__task-check">
                          {quest.completedTasks.includes(task.id) ? '✓' : '○'}
                        </span>
                        <span>{task.label}</span>
                      </div>
                    ))}
                  </div>
                  {quest.status === 'available' && onActivateQuest && (
                    <button
                      className="quest-log__activate-btn"
                      onClick={() => onActivateQuest(quest.id)}
                    >
                      Accept Quest (+{quest.xpReward} XP)
                    </button>
                  )}
                  {quest.xpReward && (
                    <span className="quest-log__xp">Reward: {quest.xpReward} XP</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QuestLog;

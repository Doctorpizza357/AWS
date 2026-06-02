import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import { useUser } from '../../context/UserContext';
import careers from '../../data/careers';
import './DreamJobPicker.css';

/**
 * `DreamJobPicker` now reflects the user's active career goal instead of
 * rendering the full career catalog. SkillBridge auto-syncs the dream job
 * to the active goal, and this panel provides a single CTA for changing
 * that goal elsewhere in the app.
 */
function DreamJobPicker() {
  const navigate = useNavigate();
  const { dreamJobId } = useSkillBridge();
  const { user } = useUser();

  const currentCareer = careers.find((career) => career.id === dreamJobId) || user.activeCareerGoal || null;

  const handleChangeGoal = () => {
    navigate('/dashboard');
  };

  return (
    <div className="dream-job-picker">
      <header className="dream-job-picker__header">
        <h2 className="dream-job-picker__title">Pick your dream job</h2>
        <p className="dream-job-picker__subtitle">
          SkillBridge is synced to your current goal job.
        </p>
      </header>

      <div className="dream-job-picker__current-card" style={{ '--card-color': currentCareer?.color || 'var(--primary)' }}>
        <div>
          <span className="dream-job-picker__current-label">Current goal</span>
          <h3 className="dream-job-picker__card-title">
            {currentCareer?.title || 'No goal selected yet'}
          </h3>
        </div>

        <span className="dream-job-picker__card-field">
          {currentCareer?.field || 'Set your goal to personalize SkillBridge'}
        </span>
        <p className="dream-job-picker__card-description">
          {currentCareer?.description || 'Choose a goal from the dashboard to sync your roadmap.'}
        </p>

        <div className="dream-job-picker__current-footer">
          <button
            type="button"
            className="dream-job-picker__change-goal"
            onClick={handleChangeGoal}
          >
            Change goal
          </button>
        </div>
      </div>
    </div>
  );
}

export default DreamJobPicker;

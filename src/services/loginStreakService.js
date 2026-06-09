/**
 * Login Streak Service - Tracks consecutive daily logins and awards bonus XP.
 */
const STREAK_KEY = 'campus_login_streak';

function getStreakData() {
  try {
    const data = localStorage.getItem(STREAK_KEY);
    return data ? JSON.parse(data) : { count: 0, lastLogin: null, todayClaimed: false };
  } catch {
    return { count: 0, lastLogin: null, todayClaimed: false };
  }
}

function saveStreakData(data) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

/**
 * Check and update login streak. Call on campus load.
 * Returns { streak, bonusXP, isNewDay, message }
 */
function checkLoginStreak() {
  const data = getStreakData();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const lastLogin = data.lastLogin;

  // Same day - already counted
  if (lastLogin === today) {
    return { streak: data.count, bonusXP: 0, isNewDay: false, message: null };
  }

  // Check if yesterday (streak continues)
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let newCount;
  let message;

  if (lastLogin === yesterdayStr) {
    // Streak continues!
    newCount = data.count + 1;
    message = `🔥 ${newCount}-day streak! +${newCount * 10} bonus XP`;
  } else if (!lastLogin) {
    // First login ever
    newCount = 1;
    message = '🎉 Welcome! Your streak starts today. +10 XP';
  } else {
    // Streak broken
    newCount = 1;
    message = '📅 New streak started! Visit daily for bonus XP. +10 XP';
  }

  const bonusXP = newCount * 10; // 10 XP per streak day (caps at 70 for 7-day)
  const cappedXP = Math.min(bonusXP, 70);

  saveStreakData({ count: newCount, lastLogin: today, todayClaimed: true });

  return { streak: newCount, bonusXP: cappedXP, isNewDay: true, message };
}

function getCurrentStreak() {
  return getStreakData().count;
}

export { checkLoginStreak, getCurrentStreak, getStreakData };

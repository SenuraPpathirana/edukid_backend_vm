import { supabase } from "../../config/supabase.js";

const getMonthRange = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    start: startOfMonth.toISOString().split("T")[0],
    end: startOfNextMonth.toISOString().split("T")[0],
  };
};

const formatPercentage = (monthlyCount, totalCount) => {
  if (!totalCount) return "0.0%";

  const percentage = (monthlyCount / totalCount) * 100;
  return `${percentage.toFixed(1)}%`;
};

const getTotalAndMonthlyCount = async (table, dateColumn, filterBuilder) => {
  let totalQuery = supabase.from(table).select("*", { count: "exact", head: true });
  let monthlyQuery = supabase.from(table).select("*", { count: "exact", head: true });

  if (filterBuilder) {
    totalQuery = filterBuilder(totalQuery);
    monthlyQuery = filterBuilder(monthlyQuery);
  }

  const { start, end } = getMonthRange();
  monthlyQuery = monthlyQuery.gte(dateColumn, start).lt(dateColumn, end);

  const [totalResult, monthlyResult] = await Promise.all([totalQuery, monthlyQuery]);

  if (totalResult.error) {
    throw new Error(`Failed to count ${table}: ${totalResult.error.message}`);
  }

  if (monthlyResult.error) {
    throw new Error(`Failed to count monthly ${table}: ${monthlyResult.error.message}`);
  }

  return {
    total: totalResult.count || 0,
    monthly: monthlyResult.count || 0,
  };
};

/**
 * Get dashboard statistics for admin
 * @returns {Promise<object>} Statistics object with counts
 */
const getDashboardStats = async () => {
  try {
    const [userStats, materialStats, quizStats, gameStats] = await Promise.all([
      getTotalAndMonthlyCount("user", "join_date"),
      getTotalAndMonthlyCount("learning_materials", "uploaded_date"),
      getTotalAndMonthlyCount("quiz", "uploaded_date"),
      getTotalAndMonthlyCount("game", "uploaded_date"),
    ]);

    const totalUsers = userStats.total;
    const monthlyUsers = userStats.monthly;

    // Get total kids/students count
    const { count: totalKids, error: kidsError } = await supabase
      .from("kid_profile")
      .select("*", { count: "exact", head: true });

    if (kidsError) throw new Error(`Failed to count kids: ${kidsError.message}`);

    // Get total active timers count (NULL end_time)
    const { count: activeTimers, error: timersError } = await supabase
      .from("timer")
      .select("*", { count: "exact", head: true })
      .is("end_time", null);

    if (timersError) throw new Error(`Failed to count timers: ${timersError.message}`);

    const totalMaterials = materialStats.total;
    const monthlyMaterials = materialStats.monthly;
    const totalQuizzes = quizStats.total;
    const monthlyQuizzes = quizStats.monthly;
    const totalGames = gameStats.total;
    const monthlyGames = gameStats.monthly;

    const userTrend = formatPercentage(monthlyUsers, totalUsers);
    const materialsTrend = formatPercentage(monthlyMaterials, totalMaterials);
    const quizzesTrend = formatPercentage(monthlyQuizzes, totalQuizzes);
    const gamesTrend = formatPercentage(monthlyGames, totalGames);

    return {
      totalUsers: totalUsers || 0,
      totalKids: totalKids || 0,
      activeTimers: activeTimers || 0,
      activeMaterials: totalMaterials || 0,
      quizzesTaken: totalQuizzes || 0,
      gameSessions: totalGames || 0,
      trends: {
        users: userTrend,
        kids: formatPercentage(0, totalKids || 0),
        timers: formatPercentage(0, activeTimers || 0),
        materials: materialsTrend,
        quizzes: quizzesTrend,
        games: gamesTrend,
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get recent activity log
 * @param {number} limit - Number of recent activities to fetch
 * @returns {Promise<Array>} Array of recent activities
 */
const getRecentActivities = async (limit = 10) => {
  try {
    // Get recent user registrations
    const { data: recentUsers, error } = await supabase
      .from("user")
      .select("user_id, fname, lname, email, join_date")
      .order("join_date", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch recent users: ${error.message}`);

    // Transform into activity log
    const activities = recentUsers.map((user) => ({
      type: "user_registered",
      text: `New user registered: ${user.fname} ${user.lname}`,
      time: new Date(user.join_date).toISOString(),
      user_id: user.user_id,
    }));

    return activities;
  } catch (error) {
    throw error;
  }
};

export { getDashboardStats, getRecentActivities };

import * as statisticsService from "./statistics.service.js";

/**
 * Get dashboard statistics
 * GET /api /statistics/dashboard
 */
const getDashboardStats = async (req, res) => {
  try {
    const stats = await statisticsService.getDashboardStats();

    res.status(200).json({
      message: "Dashboard statistics retrieved successfully",
      stats,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      message: "Failed to retrieve dashboard statistics",
      error: error.message,
    });
  }
};

/**
 * Get recent activities
 * GET /api/statistics/activities
 */
const getRecentActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activities = await statisticsService.getRecentActivities(limit);

    res.status(200).json({
      message: "Recent activities retrieved successfully",
      activities,
    });
  } catch (error) {
    console.error("Get recent activities error:", error);
    res.status(500).json({
      message: "Failed to retrieve recent activities",
      error: error.message,
    });
  }
};

export { getDashboardStats, getRecentActivities };

exports.getProfile = async (req, res) => {
  res.json({ message: 'user.profile placeholder', user: req.user || null });
};



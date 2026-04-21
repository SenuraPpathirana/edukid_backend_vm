// Placeholder service for auth
exports.createUser = async (data) => {
  return { id: 'user-placeholder', ...data };
};

exports.verifyCredentials = async (email, password) => {
  return { id: 'user-placeholder', email };
};



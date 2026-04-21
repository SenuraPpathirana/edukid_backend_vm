# Render Build Script
# Ensures production dependencies are installed correctly

echo "Installing dependencies..."
npm ci --production=false

echo "Build completed successfully!"

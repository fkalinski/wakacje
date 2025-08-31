#!/bin/bash

echo "🏖  Installing Holiday Park CLI..."
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building CLI..."
npm run build

# Create symlink for global usage (optional)
echo ""
read -p "Would you like to install the CLI globally? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    npm link
    echo "✅ CLI installed globally! You can now use 'hp' or 'holiday-park' from anywhere."
else
    echo "✅ CLI built successfully! You can run it using './hp' from this directory."
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Quick start:"
echo "  hp search --interactive    # Create an interactive search"
echo "  hp list                    # List saved searches"
echo "  hp monitor --once          # Run all searches once"
echo ""
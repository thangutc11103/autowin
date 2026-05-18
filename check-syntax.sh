#!/bin/bash

# Quick syntax check
echo "Checking TypeScript syntax..."
npx tsc --noEmit 2>&1 | head -50

echo ""
echo "If no errors above, the accounts page should render now."

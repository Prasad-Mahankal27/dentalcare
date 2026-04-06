#!/bin/bash

# This script exports the database_design.mmd to database_design.png using Mermaid.ink API
# It base64 encodes the diagram content and fetches the image via curl.

MMD_FILE="database_design.mmd"
OUTPUT_FILE="database_design.png"

if [ ! -f "$MMD_FILE" ]; then
    echo "Error: $MMD_FILE not found."
    exit 1
fi

# Encode the content to base64 (handling different base64 versions)
if [[ "$OSTYPE" == "darwin"* ]]; then
    B64_CONTENT=$(cat "$MMD_FILE" | base64)
else
    B64_CONTENT=$(cat "$MMD_FILE" | base64 -w 0)
fi

# Clean up base64 string for URL (remove newlines if any)
B64_CONTENT=$(echo "$B64_CONTENT" | tr -d '\n' | tr -d '\r')

echo "Fetching diagram from Mermaid.ink..."
curl -s -o "$OUTPUT_FILE" "https://mermaid.ink/img/$B64_CONTENT"

if [ $? -eq 0 ]; then
    echo "Successfully exported to $OUTPUT_FILE"
else
    echo "Failed to export diagram."
    exit 1
fi

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Create the DataFrame based on the provided data
data = pd.DataFrame({
    "Survey Question": [
        # "I felt comfortable indicating my opinion",
        # "I felt I had influence on the decision outcome",
        # "I felt pressure to change my opinion",
        # "I am satisfied with the decision process",
        "I find the tool easy to use",
        "I find the tool clear and understandable",
        "I felt that something in the design was out of place"
    ],

    5: [20, 17, 0],
    4: [8, 11, 7],
    3: [1, 1, 4],
    2: [0, 0, 11],
    1: [0, 0, 7]
})

# Set the index to the survey question
data.set_index("Survey Question", inplace=True)

# Define colors for each response category (from Strongly Disagree to Strongly Agree)
colors = ["#488f31", "#a9bc5b", "#ffe995", "#f89a5f", "#de425b"]  # Reversed order
response_labels = [
    "Strongly Agree",  # Reversed order
    "Agree",
    "Neutral",
    "Disagree",
    "Strongly Disagree"
]

# Set up the plot
fig, ax = plt.subplots(figsize=(12, 6))  # Increase figure width

# Plot each response category as a segment of the horizontal bar
left = np.zeros(len(data))  # Initial position for each bar segment
for idx, column in enumerate(data.columns):
    ax.barh(
        data.index, 
        data[column], 
        left=left, 
        color=colors[idx], 
        label=response_labels[idx]  # Use the new labels here
    )
    left += data[column]  # Update the starting position for the next segment

# Add labels and title
ax.set_xlabel("Number of Responses")
ax.set_ylabel("Survey Question")
ax.set_title("User Experience Questions")

# Adjust layout to prevent cutting off y-axis labels
plt.subplots_adjust(left=0.3, right=0.8)  # Adjust margins

# Move the legend outside of the plot area
ax.legend(title="Survey Answers", loc="center left", bbox_to_anchor=(1, 0.5))

plt.show()

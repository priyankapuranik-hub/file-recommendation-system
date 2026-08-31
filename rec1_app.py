import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from file_recommendation_system import FileRecommendationSystem  # Ensure your backend is saved as file_rec_system.py
import ttkbootstrap as tb

class FileRecommendationGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Smart File Recommendation System")
        self.root.geometry("900x600")
        self.root.resizable(False, False)
        self.style = tb.Style("minty")

        self.recommender = None
        self.setup_ui()

    def setup_ui(self):
        # Header Label
        header = tb.Label(self.root, text="Smart File Recommendation System", font=("Helvetica", 20, "bold"), bootstyle="info-inverse")
        header.pack(pady=20)

        # File Folder Selection
        self.path_label = tb.Label(self.root, text="No folder selected", bootstyle="secondary")
        self.path_label.pack()

        browse_btn = tb.Button(self.root, text="Browse Folder", command=self.browse_folder, bootstyle="primary")
        browse_btn.pack(pady=10)

        # Search Bar
        self.search_entry = tb.Entry(self.root, width=60)
        self.search_entry.pack(pady=10)

        # Search Button
        search_btn = tb.Button(self.root, text="Get Recommendations", command=self.get_recommendations, bootstyle="success")
        search_btn.pack(pady=10)

        # Treeview for Recommendations
        self.tree_frame = tb.Frame(self.root)
        self.tree_frame.pack(pady=20, fill=tk.BOTH, expand=True)

        self.tree = ttk.Treeview(self.tree_frame, columns=("filename", "path", "score"), show="headings")
        self.tree.heading("filename", text="Filename")
        self.tree.heading("path", text="Path")
        self.tree.heading("score", text="Similarity Score")
        self.tree.column("filename", width=200)
        self.tree.column("path", width=500)
        self.tree.column("score", width=120)

        vsb = ttk.Scrollbar(self.tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)

    def browse_folder(self):
        folder_path = filedialog.askdirectory()
        if folder_path:
            self.path_label.config(text=folder_path)
            self.recommender = FileRecommendationSystem(folder_path)
            self.recommender.generate_file_embeddings()
            messagebox.showinfo("Success", "Files indexed successfully!")

    def get_recommendations(self):
        query = self.search_entry.get().strip()
        if not query:
            messagebox.showwarning("Empty Query", "Please enter a search query.")
            return

        if not self.recommender:
            messagebox.showwarning("No Folder", "Please select and index a folder first.")
            return

        results = self.recommender.recommend_files(query)
        if not results:
            messagebox.showinfo("No Results", "No recommendations found.")
            return

        # Clear previous results
        for row in self.tree.get_children():
            self.tree.delete(row)

        # Insert new results
        for item in results:
            self.tree.insert("", tk.END, values=(item['filename'], item['path'], f"{item['similarity_score']:.4f}"))

# Run GUI
if __name__ == "__main__":
    root = tb.Window(themename="superhero")
    app = FileRecommendationGUI(root)
    root.mainloop()

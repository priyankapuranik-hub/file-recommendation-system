import os
import shutil
import threading
from tkinter import filedialog
from tkinterdnd2 import *
import ttkbootstrap as ttkb
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledFrame
from file_recommendation_system import FileRecommendationSystem  # Assume your logic is modularized

class FileRecommendationApp:
    def __init__(self, root):
        self.root = root
        self.root.title("🔍 File Recommendation System")
        self.root.geometry("960x640")
        self.root.minsize(800, 500)
        self.recommender = FileRecommendationSystem("E:\\Documents")

        self.style = ttkb.Style("darkly")
        self.root.configure(bg=self.style.colors.bg)

        self.build_ui()
        self.processing = False

    def build_ui(self):
        header = ttkb.Label(self.root, text="📂 Smart File Recommender", font=("Segoe UI", 18, "bold"), anchor="center")
        header.pack(pady=(15, 5))

        self.drop_frame = ttkb.Frame(self.root, padding=15, style="info.TFrame")
        self.drop_frame.pack(fill=X, padx=20)
        self.drop_label = ttkb.Label(self.drop_frame, text="📁 Drag & Drop files here or click to browse",
                                     font=("Segoe UI", 12), anchor="center", style="inverse-info.TLabel")
        self.drop_label.pack(fill=BOTH, expand=True, ipadx=10, ipady=15)

        try:
            self.drop_label.drop_target_register(DND_FILES)
            self.drop_label.dnd_bind('<<Drop>>', self.handle_drop)
        except Exception:
            self.drop_label.configure(text="⚠️ Drag-and-drop not available on this OS.")
        self.drop_label.bind("<Button-1>", self.browse_files)

        self.buttons_frame = ttkb.Frame(self.root, padding=10)
        self.buttons_frame.pack(fill=X, padx=20)

        self.process_button = ttkb.Button(self.buttons_frame, text="🚀 Process Files", bootstyle="primary", command=self.start_processing)
        self.process_button.pack(side=LEFT, padx=5)

        self.progress = ttkb.Progressbar(self.buttons_frame, mode="determinate", length=200)
        self.progress.pack(side=LEFT, padx=10)

        self.search_frame = ttkb.Frame(self.root, padding=(10, 5))
        self.search_frame.pack(fill=X, padx=20)

        ttkb.Label(self.search_frame, text="🔎 Enter Search Query:", font=("Segoe UI", 10)).pack(side=LEFT, padx=(5, 8))
        self.search_entry = ttkb.Entry(self.search_frame, width=40)
        self.search_entry.pack(side=LEFT, padx=(0, 8), fill=X, expand=True)
        self.search_button = ttkb.Button(self.search_frame, text="Search", bootstyle="success", command=self.search_files)
        self.search_button.pack(side=LEFT)

        self.results_frame = ScrolledFrame(self.root, padding=10, height=300)
        self.results_frame.pack(fill=BOTH, expand=True, padx=20, pady=(5, 15))

        self.tree = ttkb.Treeview(self.results_frame, columns=("Filename", "Path", "Score"), show='headings', bootstyle="dark")
        self.tree.heading("Filename", text="Filename")
        self.tree.heading("Path", text="Path")
        self.tree.heading("Score", text="Similarity Score")
        self.tree.column("Filename", width=180)
        self.tree.column("Path", width=500)
        self.tree.column("Score", width=120)
        self.tree.pack(fill=BOTH, expand=True)
        self.tree.bind("<Double-1>", self.open_file)

        self.status_var = ttkb.StringVar(value="🔧 Ready")
        self.status_bar = ttkb.Label(self.root, textvariable=self.status_var, anchor="w", bootstyle="secondary-inverse")
        self.status_bar.pack(fill=X, padx=20, pady=(0, 10))

    def handle_drop(self, event):
        if self.processing:
            self.status_var.set("⏳ Please wait until current processing is complete.")
            return
        files = self.root.splitlist(event.data)
        self.upload_files(files)

    def browse_files(self, event=None):
        if self.processing:
            self.status_var.set("⏳ Please wait until current processing is complete.")
            return
        files = filedialog.askopenfilenames(filetypes=[("Supported Files", "*.txt *.pdf *.docx *.ppt *.pptx *.jpg *.jpeg *.xlsx *.xls *.png")])
        if files:
            self.upload_files(files)

    def upload_files(self, files):
        uploaded = 0
        for file in files:
            if os.path.splitext(file)[1].lower() in self.recommender.supported_extensions:
                dest = os.path.join("E:\\Documents", os.path.basename(file))
                try:
                    shutil.copy(file, dest)
                    uploaded += 1
                except Exception as e:
                    self.status_var.set(f"❌ Error uploading {os.path.basename(file)}: {str(e)}")
        self.status_var.set(f"✅ Uploaded {uploaded} file(s)")

    def start_processing(self):
        if self.processing:
            return
        self.processing = True
        self.status_var.set("🔄 Processing files...")
        self.process_button.configure(state="disabled")
        self.progress['value'] = 0
        threading.Thread(target=self.process_files, daemon=True).start()

    def process_files(self):
        try:
            files = [os.path.join(root, f)
                     for root, _, filenames in os.walk("E:\\Documents")
                     for f in filenames
                     if self.recommender.is_valid_file(os.path.join(root, f))]

            total = len(files)
            if total == 0:
                self.root.after(0, self.processing_complete, "⚠️ No valid files to process.")
                return

            self.recommender.generate_file_embeddings()
            for i in range(total):
                self.progress['value'] = ((i + 1) / total) * 100
                self.root.update()
            self.root.after(0, self.processing_complete, f"✅ Processed {total} file(s)")
        except Exception as e:
            self.root.after(0, self.processing_complete, f"❌ Error: {str(e)}")

    def processing_complete(self, message):
        self.status_var.set(message)
        self.process_button.configure(state="normal")
        self.processing = False
        self.progress['value'] = 100

    def search_files(self):
        query = self.search_entry.get().strip()
        if not query:
            self.status_var.set("⚠️ Please enter a query.")
            return

        for item in self.tree.get_children():
            self.tree.delete(item)

        try:
            results = self.recommender.recommend_files(query)
            if not results:
                self.status_var.set("🔍 No results found.")
                return

            for r in results:
                self.tree.insert("", END, values=(r['filename'], r['path'], f"{r['similarity_score']:.4f}"))
            self.status_var.set(f"✅ Found {len(results)} result(s)")
        except Exception as e:
            self.status_var.set(f"❌ Error: {str(e)}")

    def open_file(self, event):
        item = self.tree.selection()
        if item:
            path = self.tree.item(item, "values")[1]
            try:
                os.startfile(path)
            except Exception as e:
                self.status_var.set(f"❌ Error opening file: {str(e)}")


if __name__ == "__main__":
    root = TkinterDnD.Tk()
    app = FileRecommendationApp(root)
    root.mainloop()

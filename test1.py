import os
import hashlib
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict
import faiss
import mimetypes

class FileRecommendationSystem:
    def __init__(self, base_path: str, embedding_model: str = 'all-MiniLM-L6-v2'):
        """
        Initialize the File Recommendation System
        
        Args:
            base_path (str): Root directory to scan for files
            embedding_model (str): Sentence Transformer model for generating embeddings
        """
        self.base_path = base_path
        self.model = SentenceTransformer(embedding_model)
        
        # System and temporary file extensions to exclude
        self.excluded_extensions = {
            '.tmp', '.log', '.swp', '.lock', 
            '.sys', '.dat', '.ini', '.config',
            # OS-specific system files
            '.exe', '.dll', '.bin', 
            # macOS specific
            '.DS_Store', 
            # Windows specific
            'desktop.ini', 'thumbs.db'
        }
        
        # Vector database using FAISS
        self.dimension = self.model.get_sentence_embedding_dimension()
        self.index = faiss.IndexFlatL2(self.dimension)
        
        # Metadata storage
        self.file_metadata = {}
    
    def is_valid_file(self, file_path: str) -> bool:
        """
        Check if file should be included in recommendation system
        
        Args:
            file_path (str): Path to the file
        
        Returns:
            bool: Whether file is valid for processing
        """
        # Exclude system files and files with excluded extensions
        filename = os.path.basename(file_path)
        file_ext = os.path.splitext(filename)[1].lower()
        
        conditions = [
            not filename.startswith('.'),  # Exclude hidden files
            file_ext not in self.excluded_extensions,
            os.path.isfile(file_path),  # Ensure it's a file
            os.path.getsize(file_path) > 0  # Exclude empty files
        ]
        
        return all(conditions)
    
    def extract_file_text(self, file_path: str) -> str:
        """
        Extract text content from different file types
        
        Args:
            file_path (str): Path to the file
        
        Returns:
            str: Extracted text content
        """
        try:
            mime_type, _ = mimetypes.guess_type(file_path)
            
            # Text files
            if mime_type and mime_type.startswith('text/'):
                with open(file_path, 'r', encoding='utf-8') as f:
                    return f.read()
            
            # For PDF files
            elif mime_type == 'application/pdf':
                import PyPDF2
                with open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    text = ' '.join([page.extract_text() for page in reader.pages])
                    return text
            
            # For docx files
            elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                import docx
                doc = docx.Document(file_path)
                return ' '.join([para.text for para in doc.paragraphs])
            
            return f"File type {mime_type} not supported for text extraction"
        
        except Exception as e:
            return f"Error extracting text: {str(e)}"
    
    def generate_file_embeddings(self):
        """
        Scan directory, generate embeddings for valid files and store in vector database
        """
        for root, _, files in os.walk(self.base_path):
            for filename in files:
                file_path = os.path.join(root, filename)
                
                if self.is_valid_file(file_path):
                    try:
                        # Extract text content
                        file_text = self.extract_file_text(file_path)
                        
                        # Generate embedding
                        embedding = self.model.encode(file_text)
                        
                        # Add to FAISS index
                        self.index.add(np.array([embedding]))
                        
                        # Store metadata
                        file_hash = hashlib.md5(file_path.encode()).hexdigest()
                        self.file_metadata[file_hash] = {
                            'path': file_path,
                            'filename': filename,
                            'size': os.path.getsize(file_path)
                        }
                    
                    except Exception as e:
                        print(f"Error processing {file_path}: {e}")
    
    def recommend_files(self, query: str, top_k: int = 5) -> List[Dict]:
        """
        Recommend files based on text query
        
        Args:
            query (str): User's text query
            top_k (int): Number of top recommendations to return
        
        Returns:
            List of recommended files with metadata
        """
        # Generate embedding for query
        query_embedding = self.model.encode(query)
        
        # Search in vector database
        distances, indices = self.index.search(np.array([query_embedding]), top_k)
        
        # Retrieve and return recommended files
        recommendations = []
        for dist, idx in zip(distances[0], indices[0]):
            file_hash = list(self.file_metadata.keys())[idx]
            file_info = self.file_metadata[file_hash]
            file_info['similarity_score'] = 1 / (1 + dist)  # Convert distance to similarity
            recommendations.append(file_info)
        
        return recommendations

# Example usage
if __name__ == "__main__":
    # Initialize the system with base path
    recommender = FileRecommendationSystem("E:\\Python_programs")
    
    # Generate embeddings for all files
    recommender.generate_file_embeddings()
    
    # Example recommendation
    results = recommender.recommend_files("Squareroot of a number")
    for result in results:
        print(f"Recommended File: {result['filename']}")
        print(f"Path: {result['path']}")
        print(f"Similarity Score: {result['similarity_score']}\n")
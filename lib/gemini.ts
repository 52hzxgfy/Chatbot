import { GoogleGenerativeAI, GenerativeModel, ChatSession, Part } from "@google/generative-ai";
import { FileContent, FileData } from './types';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private chat: ChatSession;
  private history: ChatHistoryMessage[] = [];
  private static readonly FILE_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/files';
  private fileCache: Map<string, {uri: string, expiresAt: number}>;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    });
    this.chat = this.model.startChat();
    this.history = [];
    this.fileCache = new Map();
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash?key=${this.genAI.apiKey}`
      );
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  startNewChat(options?: StartChatOptions) {
    try {
      if (options?.history && Array.isArray(options.history)) {
        this.history = [...options.history];
        
        this.chat = this.model.startChat({
          history: this.history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.parts[0].text }]
          })),
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
        });
      } else {
        this.history = [];
        this.chat = this.model.startChat();
      }
      return this.chat;
    } catch (error) {
      console.error('Error starting new chat:', error);
      throw error;
    }
  }

  async sendMessage(
    message: string, 
    systemPrompt?: string,
    chatSession?: ChatSession
  ): Promise<string> {
    try {
      const activeChat = chatSession || this.chat;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          if (systemPrompt) {
            await activeChat.sendMessage(systemPrompt);
            this.history.push({
              role: 'model',
              parts: [{ text: systemPrompt }]
            });
          }

          this.history.push({
            role: 'user',
            parts: [{ text: message }]
          });

          const result = await activeChat.sendMessage(message);
          const response = await result.response;
          
          this.history.push({
            role: 'model',
            parts: [{ text: response.text() }]
          });
          
          return response.text();
        } catch (error) {
          attempts++;
          if (attempts === maxAttempts) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
      throw new Error('Failed to send message after multiple attempts');
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  getHistory() {
    return this.chat.getHistory();
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${this.genAI.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate text');
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Text generation error:', error);
      throw error;
    }
  }

  async processFile(file: File, prompt: string): Promise<string> {
    try {
      // 对于大文件使用File API
      if (file.size > 20 * 1024 * 1024) {
        const { uri } = await this.uploadFile(file);
        
        const result = await this.model.generateContent([
          {
            text: prompt
          } as Part,
          {
            fileData: {
              fileUri: uri,
              mimeType: file.type
            }
          } as Part
        ]);

        const response = await result.response;
        return response.text();
      } else {
        // 小文件使用内联数据
        const base64Data = await this.fileToBase64(file);
        
        const fileData: FileData = {
          inlineData: {
            data: base64Data,
            mimeType: file.type
          }
        };

        const result = await this.model.generateContent([
          {
            text: prompt
          } as Part,
          {
            fileData
          } as unknown as Part
        ]);

        const response = await result.response;
        return response.text();
      }
    } catch (error) {
      console.error('File processing error:', error);
      throw error;
    }
  }

  async processAudio(file: File, prompt: string, options?: {
    transcribe?: boolean;
    timeRange?: { start: string; end: string; }
  }): Promise<string> {
    try {
      const supportedAudioTypes = [
        'audio/wav',
        'audio/mp3',
        'audio/aiff',
        'audio/aac',
        'audio/ogg',
        'audio/flac'
      ];

      if (!supportedAudioTypes.includes(file.type)) {
        throw new Error('Unsupported audio format');
      }

      const duration = await this.getAudioDuration(file);
      if (duration > 34200) {
        throw new Error('Audio file is too long. Maximum duration is 9.5 hours.');
      }

      // 构建提示
      let finalPrompt = prompt;
      if (options?.transcribe) {
        finalPrompt = 'Generate a transcript of the audio. ' + prompt;
      }
      if (options?.timeRange) {
        finalPrompt += ` Focus on the section from ${options.timeRange.start} to ${options.timeRange.end}.`;
      }

      // 对于大文件使用File API
      if (file.size > 20 * 1024 * 1024) {
        const { uri } = await this.uploadFile(file);
        
        const result = await this.model.generateContent([
          {
            text: finalPrompt
          } as Part,
          {
            fileData: {
              fileUri: uri,
              mimeType: file.type
            }
          } as Part
        ]);

        const response = await result.response;
        return response.text();
      } else {
        const base64Data = await this.fileToBase64(file);
        
        const fileData: FileData = {
          inlineData: {
            data: base64Data,
            mimeType: file.type
          }
        };

        const result = await this.model.generateContent([
          {
            text: finalPrompt
          } as Part,
          {
            fileData
          } as unknown as Part
        ]);

        const response = await result.response;
        return response.text();
      }
    } catch (error) {
      console.error('Audio processing error:', error);
      throw error;
    }
  }

  private async getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration);
      });
      
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load audio file'));
      });
      
      audio.src = url;
    });
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  }

  // 添加文件上传进度监控（可选）
  private async uploadFileWithProgress(file: File, onProgress?: (progress: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response.uri);
          } catch (error) {
            reject(new Error('Invalid response format'));
          }
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      const formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', `https://generativelanguage.googleapis.com/v1/files:upload?key=${this.genAI.apiKey}`);
      xhr.send(formData);
    });
  }

  async uploadFile(file: File): Promise<{uri: string, name: string}> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${GeminiService.FILE_API_ENDPOINT}:upload?key=${this.genAI.apiKey}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    const data = await response.json();
    // 缓存文件URI，48小时后过期
    this.fileCache.set(data.name, {
      uri: data.uri,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000
    });
    
    return {
      uri: data.uri,
      name: data.name
    };
  }

  async deleteFile(name: string): Promise<void> {
    const response = await fetch(
      `${GeminiService.FILE_API_ENDPOINT}/${name}?key=${this.genAI.apiKey}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
    
    this.fileCache.delete(name);
  }

  async listFiles(): Promise<Array<{name: string, uri: string}>> {
    const response = await fetch(
      `${GeminiService.FILE_API_ENDPOINT}?key=${this.genAI.apiKey}`
    );

    if (!response.ok) {
      throw new Error('Failed to list files');
    }

    const data = await response.json();
    return data.files;
  }
}

interface ChatHistoryMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface StartChatOptions {
  history?: ChatHistoryMessage[];
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

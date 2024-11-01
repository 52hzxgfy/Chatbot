"use client";

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Settings, Edit2, Trash2, Send, Paperclip, X, Copy } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { GeminiService } from '@/lib/gemini'
import { ChatMessage } from '@/components/chat-message'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import copy from 'clipboard-copy'
import cn from 'classnames'
import { Message, Conversation, ModelType, ApiKeys, ChatHistoryMessage } from '@/lib/types'
import { GroqService } from '@/lib/groq';
import { Chat } from '@/components/chat';
import { ChatPoolManager } from '@/lib/chatPoolManager';
import { QwenService } from '@/lib/qwen';
import { extractTimeRange } from '@/lib/utils';

export function Page() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedModel, setSelectedModel] = useState("Llama 3.1 70B")
  const [inputMessage, setInputMessage] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [isSystemPromptEnabled, setIsSystemPromptEnabled] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    "Llama 3.1 70B": "",
    "Gemini 1.5 Flash": "",
    "Qwen/Qwen2.5-72B-Instruct": ""
  })
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const geminiService = useRef<GeminiService | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [currentChat, setCurrentChat] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const groqService = useRef<GroqService | null>(null);
  const chatPool = useRef(ChatPoolManager.getInstance());

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)
  const openSettings = () => setIsSettingsOpen(true)
  const closeSettings = () => setIsSettingsOpen(false)

  const addConversation = () => {
    handleNewConversation(); // 直接调用 handleNewConversation
  };

  const editConversation = (id: number, newTitle: string) => {
    setConversations(conversations.map(conv => 
      conv.id === id ? { ...conv, title: newTitle } : conv
    ))
  }

  const deleteConversation = (id: number) => {
    setConversations(conversations.filter(conv => conv.id !== id))
    if (currentConversationId === id) {
      setMessages([]);
      setCurrentConversationId(null);
    }
  }
  useEffect(() => {
    if (selectedModel in apiKeys && apiKeys[selectedModel as keyof ApiKeys]) {
      geminiService.current = new GeminiService(apiKeys[selectedModel as keyof ApiKeys]);
      // 创建新的对话
      const chat = geminiService.current.startNewChat();
      setCurrentChat(chat);
    }
  }, [apiKeys, selectedModel]);

  const handleSendMessage = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    // 如果是键盘事件且不是回车键，直接返回
    if (e?.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') {
      return;
    }
    
    // 如果是回车键但同时按着 Shift 键，不处理（允许换行）
    if (e?.type === 'keydown' && (e as React.KeyboardEvent).shiftKey) {
      return;
    }

    // 阻止默认行为
    e?.preventDefault();

    if (selectedModel !== "Gemini 1.5 Flash" && 
        selectedModel !== "Llama 3.1 70B" &&
        selectedModel !== "Qwen/Qwen2.5-72B-Instruct") {
      alert("请先选择支持的模型");
      return;
    }

    if ((!inputMessage.trim() && !selectedFile) || !geminiService.current) {
      return;
    }

    let messageContent = inputMessage;
    if (selectedFile) {
      // 修改文件上传消息的格式，突出用户的处理需求
      messageContent = `[文件上传] ${selectedFile.name} (${selectedFile.type})\n处理需求：${inputMessage || "请分析这个文件的内容"}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    
    // 添加这段代码来重置输入框高度
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.style.height = '40px'; // 设置回初始高度
    }
    
    setIsProcessing(true);

    try {
      let chatInstance;
      let newId = currentConversationId;
      let response: string;
      
      if (!currentConversationId) {
        // 创建新对话
        newId = Date.now();
        chatInstance = await chatPool.current.getOrCreateChat(
          newId,
          selectedModel,
          apiKeys[selectedModel]
        );
        setCurrentConversationId(newId);
        setCurrentChat(chatInstance.chat);

        // 创建新的对话记录
        const newConversation: Conversation = {
          id: newId,
          title: messageContent.slice(0, 10) + '...',
          messages: [userMessage],
          lastUpdated: new Date(),
          isEditing: false
        };
        setConversations(prev => [...prev, newConversation]);
      } else {
        chatInstance = await chatPool.current.getOrCreateChat(
          currentConversationId,
          selectedModel,
          apiKeys[selectedModel],
          messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          }))
        );
      }

      // 处理文件上传
      if (selectedFile) {
        if (selectedModel !== "Gemini 1.5 Flash") {
          alert("文件处理功能仅支持 Gemini 1.5 Flash 模型");
          return;
        }

        const geminiService = chatInstance.service as GeminiService;
        
        try {
          // 根据文件类型选择处理方法
          if (selectedFile.type.startsWith('audio/')) {
            response = await geminiService.processAudio(
              selectedFile,
              inputMessage || "请分析这个音频文件的内容",
              {
                transcribe: inputMessage.toLowerCase().includes('转录'),
                timeRange: extractTimeRange(inputMessage)
              }
            );
          } else {
            response = await geminiService.processFile(
              selectedFile,
              inputMessage || "请分析这个文件的内容"
            );
          }

          // 如果是大文件，添加清理定时器
          if (selectedFile.size > 20 * 1024 * 1024) {
            setTimeout(async () => {
              try {
                const files = await geminiService.listFiles();
                for (const file of files) {
                  await geminiService.deleteFile(file.name);
                }
              } catch (error) {
                console.error('Failed to cleanup files:', error);
              }
            }, 47 * 60 * 60 * 1000); // 47小时后清理
          }
        } catch (error) {
          console.error('File processing error:', error);
          throw error;
        }
      } else {
        // 普通文本消息处理，添加系统提示词支持
        response = await chatInstance.service.sendMessage(
          messageContent,
          isSystemPromptEnabled ? systemPrompt : undefined,
          chatInstance.chat
        );
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.trim(),
        timestamp: new Date()
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);

      // 更新会话池中的历史记录
      chatPool.current.updateHistory(
        currentConversationId!,
        updatedMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))
      );

      // 更新对话列表
      setConversations(prevConversations => 
        prevConversations.map(conv => 
          conv.id === newId 
            ? {
                ...conv,
                messages: updatedMessages,
                lastUpdated: new Date()
              }
            : conv
        )
      );

      // 清除已处理的文件
      setSelectedFile(null);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('发送消息失败，请检查网络连接或 API 密钥是否正确');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // 验证文类型
    const supportedTypes = [
      // 图片类型
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'image/heif',
      // 视频类型
      'video/mp4',
      'video/mpeg',
      'video/mov',
      'video/avi',
      'video/x-flv',
      'video/mpg',
      'video/webm',
      'video/wmv',
      'video/3gpp',
      // 音频类型
      'audio/wav',
      'audio/mp3',
      'audio/aiff',
      'audio/aac',
      'audio/ogg',
      'audio/flac',
      // 文档类型
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'text/plain' // .txt
    ];

    if (!supportedTypes.includes(file.type)) {
      alert('不支持的文件类型。请上传图片、视频、音频或文档文件(PDF/Word/TXT)。');
      return;
    }

    setSelectedFile(file);
  };

  const handleApiKeySave = async (model: string) => {
    try {
      const updatedKeys = { ...apiKeys };
      // 保存到localStorage
      localStorage.setItem('apiKeys', JSON.stringify(updatedKeys));
      // 重新初始化GeminiService
      if (model === "Gemini 1.5 Flash") {
        geminiService.current = new GeminiService(updatedKeys[model]);
        const chat = geminiService.current.startNewChat();
        setCurrentChat(chat);
      }
      alert(`${model} API密钥已保存`);
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('保存API密钥失败');
    }
  };
  const handleApiKeyTest = async (model: ModelType) => {
    if (!apiKeys[model]) {
      alert('请先输入API密钥');
      return;
    }

    try {
      let isConnected: boolean = false;
      if (model === "Llama 3.1 70B") {
        const service = new GroqService(apiKeys[model], model);
        isConnected = await service.testConnection();
      } else if (model === "Gemini 1.5 Flash") {
        const service = new GeminiService(apiKeys[model]);
        isConnected = await service.testConnection();
      } else if (model === "Qwen/Qwen2.5-72B-Instruct") {
        const service = new QwenService(apiKeys[model]);
        isConnected = await service.testConnection();
      } else {
        alert('暂不支持该模型的连接测试');
        return;
      }
      
      if (isConnected) {
        alert('连接测试成功!');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      const errorMessage = error instanceof Error ? error.message : '请检查网络连接和 API 密钥';
      alert(`连接测试失败:\n${errorMessage}`);
    }
  };

  // 组件加载时读取保存的API密钥
  useEffect(() => {
    const savedKeys = localStorage.getItem('apiKeys');
    if (savedKeys) {
      setApiKeys(JSON.parse(savedKeys));
    }
  }, []);

  // 处理模型选择
  const handleModelSelect = (model: ModelType) => {
    if (model !== "Gemini 1.5 Flash" && 
        model !== "Llama 3.1 70B" &&
        model !== "Qwen/Qwen2.5-72B-Instruct") {
      alert("目前只支持 Gemini 1.5 Flash、Llama 3.1 70B 和 Qwen/Qwen2.5-72B-Instruct 模型");
      return;
    }
    setSelectedModel(model);
  };

  // 复制消息到剪贴板
  const handleCopyMessage = async (content: string) => {
    try {
      await copy(content);
      alert('已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  // 保存当前对话
  const saveCurrentConversation = () => {
    if (messages.length === 0) return;
    
    const title = messages[0].content.slice(0, 10) + '...';
    const newConversation: Conversation = {
      id: Date.now(),
      title,
      messages: [...messages],
      lastUpdated: new Date()
    };
    
    setConversations(prev => [...prev, newConversation]);
  };

  // 新建对话时重置 chat
  const handleNewConversation = () => {
    if (currentConversationId) {
      chatPool.current.removeChat(currentConversationId);
    }
    setMessages([]);
    setCurrentConversationId(null);
    setInputMessage('');
    setCurrentChat(null);
  };

  // 加载历史对话
  const loadConversation = async (id: number) => {
    const conversation = conversations.find(conv => conv.id === id);
    if (!conversation) return;

    try {
      const history = conversation.messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const chatInstance = await chatPool.current.getOrCreateChat(
        id,
        selectedModel as ModelType,
        apiKeys[selectedModel as keyof ApiKeys],
        history.map(msg => ({
          role: msg.role as "user" | "model",
          parts: msg.parts
        }))
      );

      setCurrentChat(chatInstance.chat);
      setMessages(conversation.messages);
      setCurrentConversationId(id);
    } catch (error) {
      console.error('Error loading conversation:', error);
      alert('加载对话失败，请重试');
    }
  };

  // 监听第一轮对话完成
  useEffect(() => {
    // 只有当没有当前对话ID且刚完成第一轮对话时才创建新的对话记录
    if (messages.length === 2 && !currentConversationId) {
      const title = messages[0].content.slice(0, 10) + (messages[0].content.length > 10 ? '...' : '');
      const newConversation: Conversation = {
        id: Date.now(),
        title,
        messages: [...messages],
        lastUpdated: new Date(),
        isEditing: false
      };
      setConversations(prev => [...prev, newConversation]);
      setCurrentConversationId(newConversation.id);
    }
  }, [messages, currentConversationId]);

  // 在组件加载时读取保存的对话记
  useEffect(() => {
    const savedConversations = localStorage.getItem('conversations');
    if (savedConversations) {
      console.log('Loading conversations from localStorage:', JSON.parse(savedConversations));
      const parsed = JSON.parse(savedConversations);
      // 转换日期字符串回 Date 对象
      const conversations = parsed.map((conv: any) => ({
        ...conv,
        lastUpdated: new Date(conv.lastUpdated),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
      setConversations(conversations);
    }
  }, []);

  // 对话记录更新时保存到 localStorage
  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations));
  }, [conversations]);

  const handleClearFile = () => {
    setSelectedFile(null);
  };

  // 添加系统提示词相关的处理函数
  const handleSystemPromptToggle = (enabled: boolean) => {
    setIsSystemPromptEnabled(enabled);
    // 保存到 localStorage
    localStorage.setItem('isSystemPromptEnabled', JSON.stringify(enabled));
  };

  const handleSystemPromptChange = (value: string) => {
    setSystemPrompt(value);
    // 保存到 localStorage
    localStorage.setItem('systemPrompt', value);
  };

  // 在组件加载时读取保存的系统提示词设置
  useEffect(() => {
    const savedSystemPrompt = localStorage.getItem('systemPrompt');
    const savedIsEnabled = localStorage.getItem('isSystemPromptEnabled');
    
    if (savedSystemPrompt) {
      setSystemPrompt(savedSystemPrompt);
    }
    if (savedIsEnabled) {
      setIsSystemPromptEnabled(JSON.parse(savedIsEnabled));
    }
  }, []);

  return (
    <div className="flex h-screen bg-gradient-to-br from-purple-100 to-indigo-200">
      {/* Sidebar */}
      <div className={`bg-white bg-opacity-80 backdrop-blur-md w-64 p-4 flex flex-col ${isSidebarOpen ? '' : 'hidden'}`}>
        <Button 
          onClick={handleNewConversation} 
          className="mb-4 w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> 新建对话
        </Button>
        
        <div className="flex-grow overflow-y-auto space-y-2">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={cn(
                "flex items-center justify-between p-4 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg cursor-pointer transition-colors duration-200",
                currentConversationId === conv.id && "bg-purple-100"
              )}
              onClick={() => loadConversation(conv.id)}
            >
              <div className="flex-1">
                {conv.isEditing ? (
                  <input
                    type="text"
                    defaultValue={conv.title}
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-300 rounded px-2 py-1"
                    onBlur={(e) => {
                      editConversation(conv.id, e.target.value);
                      setConversations(conversations.map(c => 
                        c.id === conv.id ? { ...c, isEditing: false } : c
                      ));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="px-2 py-1">{conv.title}</span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConversations(conversations.map(c => 
                      c.id === conv.id ? { ...c, isEditing: true } : c
                    ));
                  }}
                >
                  <Edit2 className="h-4 w-4 text-indigo-500" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="mt-4 border-purple-300 text-purple-700 hover:bg-purple-100" onClick={openSettings}>
          <Settings className="mr-2 h-4 w-4" /> 设置
        </Button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="p-4 flex items-center">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-4 text-indigo-600 hover:bg-indigo-100">
            {isSidebarOpen ? <ChevronLeft /> : <ChevronRight />}
          </Button>
          <Select value={selectedModel} onValueChange={handleModelSelect}>
            <SelectTrigger className="w-[180px] bg-white bg-opacity-70 backdrop-blur-sm border-indigo-300">
              <SelectValue placeholder="择模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Llama 3.1 70B">Llama 3.1 70B</SelectItem>
              <SelectItem value="Gemini 1.5 Flash">Gemini 1.5 Flash</SelectItem>
              <SelectItem value="Qwen/Qwen2.5-72B-Instruct">Qwen/Qwen2.5-72B-Instruct</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <Chat
            selectedModel={selectedModel as ModelType}
            messages={messages}
            groqApiKey={apiKeys["Llama 3.1 70B"]}
            geminiApiKey={apiKeys["Gemini 1.5 Flash"]}
          />
          {isProcessing && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            </div>
          )}
        </div>
        {/* 添加一个包装容器来控制输入框宽度 */}
        <div className="w-full flex justify-center p-4">
          <div className="w-[70%]">
            <div className="flex flex-col space-y-2">
              {selectedFile && (
                <div className="flex items-center space-x-2 bg-white bg-opacity-60 rounded-lg p-2">
                  <div className="flex-1 text-sm text-gray-600">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearFile}
                    className="h-6 w-6"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center space-x-2 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="absolute left-2 h-6 w-6"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt"
                />
                <textarea
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                    // 自动调整高度
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onKeyDown={handleSendMessage}
                  placeholder={selectedFile 
                    ? "请输入您希望AI如何处理这个文件（例如：分析文件内容、提取关键信息等）..." 
                    : "在这里输入您的消息..."}
                  className="flex-1 pl-10 p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white bg-opacity-60 resize-none min-h-[40px] max-h-[200px] overflow-y-auto"
                  rows={1}
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={isProcessing || (!inputMessage.trim() && !selectedFile)}
                  className="absolute right-2 bg-indigo-600 hover:bg-indigo-700 text-white h-6 w-6"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white bg-opacity-90 p-6 rounded-lg w-[600px] max-h-[80vh] overflow-y-auto relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              onClick={closeSettings}
            >
              <X className="h-4 w-4" />
            </Button>
            <h2 className="text-2xl font-bold mb-4 text-indigo-800">设置</h2>
            <Tabs defaultValue="api-connection">
              <TabsList className="mb-4 bg-indigo-100">
                <TabsTrigger value="api-connection" className="data-[state=active]:bg-indigo-200">模型 API 连接</TabsTrigger>
                <TabsTrigger value="system-prompt" className="data-[state=active]:bg-indigo-200">系统提示词</TabsTrigger>
              </TabsList>
              <TabsContent value="api-connection">
                {/* Llama 3.1 70B API 配置 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-indigo-700 mb-2">Llama 3.1 70B API 密钥</label>
                  <Input
                    type="password"
                    value={apiKeys["Llama 3.1 70B"]}
                    onChange={(e) => setApiKeys({...apiKeys, ["Llama 3.1 70B"]: e.target.value})}
                    placeholder="输入 Llama 3.1 70B API 密钥"
                    className="mb-2 border-indigo-300"
                  />
                  <div className="flex space-x-2">
                    <Button variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => handleApiKeySave("Llama 3.1 70B")}>保存</Button>
                    <Button variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => handleApiKeyTest("Llama 3.1 70B")}>测试连接</Button>
                  </div>
                </div>

                {/* Gemini 1.5 Flash API 配置 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-indigo-700 mb-2">Gemini 1.5 Flash API 密钥</label>
                  <Input
                    type="password"
                    value={apiKeys["Gemini 1.5 Flash"]}
                    onChange={(e) => setApiKeys({...apiKeys, ["Gemini 1.5 Flash"]: e.target.value})}
                    placeholder="输入 Gemini 1.5 Flash API 密钥"
                    className="mb-2 border-indigo-300"
                  />
                  <div className="flex space-x-2">
                    <Button variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => handleApiKeySave("Gemini 1.5 Flash")}>保存</Button>
                    <Button variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => handleApiKeyTest("Gemini 1.5 Flash")}>测试连接</Button>
                  </div>
                </div>

                {/* Qwen API 配置 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-indigo-700 mb-2">Qwen/Qwen2.5-72B-Instruct API 密钥</label>
                  <Input
                    type="password"
                    value={apiKeys["Qwen/Qwen2.5-72B-Instruct"]}
                    onChange={(e) => setApiKeys({...apiKeys, ["Qwen/Qwen2.5-72B-Instruct"]: e.target.value})}
                    placeholder="输入 Qwen/Qwen2.5-72B-Instruct API 密钥"
                    className="mb-2 border-indigo-300"
                  />
                  <div className="flex space-x-2">
                    <Button variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => handleApiKeySave("Qwen/Qwen2.5-72B-Instruct")}>保存</Button>
                    <Button variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => handleApiKeyTest("Qwen/Qwen2.5-72B-Instruct")}>测试连接</Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="system-prompt">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-indigo-700">启用系统示词</label>
                  <Switch
                    checked={isSystemPromptEnabled}
                    onCheckedChange={handleSystemPromptToggle}
                  />
                </div>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => handleSystemPromptChange(e.target.value)}
                  placeholder="在这里输入全局系统提示词..."
                  className="w-full h-32 border-indigo-300"
                  disabled={!isSystemPromptEnabled}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  )
}

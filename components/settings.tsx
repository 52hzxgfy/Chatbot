import { FC } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { X } from 'lucide-react'
import { ApiKeys } from '@/lib/types'

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: ApiKeys;
  onApiKeySave: (model: string) => void;
  onApiKeyTest: (model: string) => void;
  onApiKeyChange: (model: string, value: string) => void;
  systemPrompt: string;
  isSystemPromptEnabled: boolean;
  onSystemPromptChange: (value: string) => void;
  onSystemPromptToggle: (enabled: boolean) => void;
}

export const Settings: FC<SettingsProps> = ({
  isOpen,
  onClose,
  apiKeys,
  onApiKeySave,
  onApiKeyTest,
  onApiKeyChange,
  systemPrompt,
  isSystemPromptEnabled,
  onSystemPromptChange,
  onSystemPromptToggle
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center backdrop-blur-sm">
      {/* ... 其余代码保持不变 */}

      <TabsContent value="system-prompt">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-indigo-700">启用系统提示词</label>
          <Switch
            checked={isSystemPromptEnabled}
            onCheckedChange={onSystemPromptToggle}
          />
        </div>
        <Textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder="在这里输入全局系统提示词..."
          className="w-full h-32 border-indigo-300"
          disabled={!isSystemPromptEnabled}
        />
        <p className="mt-2 text-sm text-gray-500">
          系统提示词将作为上下文添加到所有对话中。启用后，所有模型都会收到这个提示词作为系统级指令。
        </p>
      </TabsContent>

      {/* ... 其余代码保持不变 */}
    </div>
  );
}; 
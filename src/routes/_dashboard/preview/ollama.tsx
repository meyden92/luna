import { createFileRoute } from '@tanstack/react-router';
import { AlertCircleIcon, CheckCircleIcon, SendIcon, SquareIcon, ZapIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useOllama } from '@/hooks/use-ollama';
import { formatSize } from '@/libs/utils';
import type { ChatStreamChunk, GenerateStreamChunk, Message, ModelInfo, OllamaStream } from '@/types/ollama';

interface ChatMessage extends Message {
  id: string;
}

let messageIdCounter = 0;
function createChatMessage(msg: Message): ChatMessage {
  return { ...msg, id: `msg-${++messageIdCounter}` };
}

const MODEL_SIZE_OPTIONS = { maxUnit: 'TB', trim: true } as const;

export const Route = createFileRoute('/_dashboard/preview/ollama')({
  head: () => ({ meta: [{ title: 'Ollama | LunaShare' }] }),
  component: OllamaTestPage,
});

function OllamaTestPage() {
  const { ollama, isAvailable, isLoading, error } = useOllama();

  const [pingResult, setPingResult] = useState<boolean | null>(null);
  const [pingLoading, setPingLoading] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModelDetails, setSelectedModelDetails] = useState<ModelInfo | null>(null);

  const [chatModel, setChatModel] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatStreamRef = useRef<OllamaStream<ChatStreamChunk> | null>(null);

  const [generateModel, setGenerateModel] = useState<string>('');
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateTemperature, setGenerateTemperature] = useState(0.7);
  const [generateResponse, setGenerateResponse] = useState('');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateStreaming, setGenerateStreaming] = useState(false);
  const generateStreamRef = useRef<OllamaStream<GenerateStreamChunk> | null>(null);

  const [embedModel, setEmbedModel] = useState<string>('');
  const [embedInput, setEmbedInput] = useState('');
  const [embedResult, setEmbedResult] = useState<{ length: number; preview: number[] } | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);

  const handlePing = async () => {
    if (!ollama) return;
    setPingLoading(true);
    setPingResult(null);
    try {
      setPingResult(await ollama.ping());
    } catch {
      setPingResult(false);
    } finally {
      setPingLoading(false);
    }
  };

  const handleLoadModels = async () => {
    if (!ollama) return;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await ollama.list();
      setModels(result.models);
      if (result.models.length > 0 && !chatModel) {
        setChatModel(result.models[0]!.name);
        setGenerateModel(result.models[0]!.name);
        setEmbedModel(result.models[0]!.name);
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSendChat = async (stream: boolean) => {
    if (!ollama || !chatModel || !chatInput.trim()) return;

    const userMessage = createChatMessage({ role: 'user', content: chatInput.trim() });
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    const apiMessages: Message[] = newMessages.map(({ role, content, images }) => ({ role, content, images }));
    setChatInput('');
    setChatResponse('');
    setChatLoading(true);

    try {
      if (stream) {
        setChatStreaming(true);
        const chatStream = ollama.chat({
          model: chatModel,
          messages: apiMessages,
          stream: true,
        }) as unknown as OllamaStream<ChatStreamChunk>;
        chatStreamRef.current = chatStream;

        let fullResponse = '';
        for await (const chunk of chatStream) {
          fullResponse += chunk.message.content;
          setChatResponse(fullResponse);
        }

        setChatMessages((prev) => [...prev, createChatMessage({ role: 'assistant', content: fullResponse })]);
      } else {
        const result = await ollama.chat({ model: chatModel, messages: apiMessages });
        setChatResponse(result.message.content);
        setChatMessages((prev) => [...prev, createChatMessage(result.message)]);
      }
    } catch (err) {
      setChatResponse(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setChatLoading(false);
      setChatStreaming(false);
      chatStreamRef.current = null;
    }
  };

  const handleAbortChat = () => {
    chatStreamRef.current?.abort();
    setChatStreaming(false);
    setChatLoading(false);
  };

  const handleGenerate = async (stream: boolean) => {
    if (!ollama || !generateModel || !generatePrompt.trim()) return;

    setGenerateResponse('');
    setGenerateLoading(true);

    try {
      if (stream) {
        setGenerateStreaming(true);
        const genStream = ollama.generate({
          model: generateModel,
          prompt: generatePrompt,
          stream: true,
          options: { temperature: generateTemperature },
        }) as unknown as OllamaStream<GenerateStreamChunk>;
        generateStreamRef.current = genStream;

        let fullResponse = '';
        for await (const chunk of genStream) {
          fullResponse += chunk.response;
          setGenerateResponse(fullResponse);
        }
      } else {
        const result = await ollama.generate({
          model: generateModel,
          prompt: generatePrompt,
          options: { temperature: generateTemperature },
        });
        setGenerateResponse(result.response);
      }
    } catch (err) {
      setGenerateResponse(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenerateLoading(false);
      setGenerateStreaming(false);
      generateStreamRef.current = null;
    }
  };

  const handleAbortGenerate = () => {
    generateStreamRef.current?.abort();
    setGenerateStreaming(false);
    setGenerateLoading(false);
  };

  const handleEmbed = async () => {
    if (!ollama || !embedModel || !embedInput.trim()) return;

    setEmbedLoading(true);
    setEmbedError(null);
    setEmbedResult(null);

    try {
      const result = await ollama.embed({ model: embedModel, input: embedInput.trim() });
      const embedding = result.embeddings[0];
      if (embedding) {
        setEmbedResult({ length: embedding.length, preview: embedding.slice(0, 10) });
      }
    } catch (err) {
      setEmbedError(err instanceof Error ? err.message : 'Failed to generate embeddings');
    } finally {
      setEmbedLoading(false);
    }
  };

  return (
    <section className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Ollama Bridge Test Page</h1>

      <Tabs defaultValue="connection">
        <TabsList>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
        </TabsList>

        <TabsContent
          value="connection"
          className="mt-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Connection Status</CardTitle>
              <CardDescription>Check if the Ollama Bridge extension and server are available</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Extension:</span>
                {isLoading ? (
                  <Badge
                    variant="outline"
                    className="gap-1"
                  >
                    <Spinner className="size-3" />
                    Checking...
                  </Badge>
                ) : isAvailable ? (
                  <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                    <CheckCircleIcon className="size-3" />
                    Available
                  </Badge>
                ) : (
                  <Badge
                    variant="destructive"
                    className="gap-1"
                  >
                    <AlertCircleIcon className="size-3" />
                    Not Available
                  </Badge>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircleIcon className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-4">
                <Button
                  onClick={handlePing}
                  disabled={!isAvailable || pingLoading}
                >
                  {pingLoading && <Spinner className="mr-2" />}
                  Ping Server
                </Button>
                {pingResult !== null && (
                  <Badge
                    className={pingResult ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    variant={pingResult ? 'outline' : 'destructive'}
                  >
                    {pingResult ? 'Connected' : 'Disconnected'}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="models"
          className="mt-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Available Models</CardTitle>
              <CardDescription>List and inspect models installed on your Ollama server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleLoadModels}
                disabled={!isAvailable || modelsLoading}
              >
                {modelsLoading && <Spinner className="mr-2" />}
                Load Models
              </Button>

              {modelsError && (
                <Alert variant="destructive">
                  <AlertCircleIcon className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{modelsError}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {models.map((model) => (
                  <Card
                    key={model.name}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedModelDetails?.name === model.name ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setSelectedModelDetails(model)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{model.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-1">
                      <p>Size: {formatSize(model.size, MODEL_SIZE_OPTIONS)}</p>
                      <p>Parameters: {model.details.parameter_size}</p>
                      <p>Family: {model.details.family}</p>
                      <p>Quantization: {model.details.quantization_level}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedModelDetails && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-lg">Model Details: {selectedModelDetails.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">{JSON.stringify(selectedModelDetails, null, 2)}</pre>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="chat"
          className="mt-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Chat</CardTitle>
              <CardDescription>Have a conversation with a model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Model:</span>
                <Select
                  value={chatModel}
                  onValueChange={(v) => v && setChatModel(v)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={model.name}
                        value={model.name}
                      >
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {models.length === 0 && <span className="text-sm text-muted-foreground">Load models first</span>}
              </div>

              <ScrollArea className="h-64 rounded-lg border p-4">
                <div className="space-y-4">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {chatLoading && chatResponse && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                        <p className="text-sm whitespace-pre-wrap">{chatResponse}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat(false);
                    }
                  }}
                  disabled={chatLoading}
                />
                <Button
                  onClick={() => handleSendChat(false)}
                  disabled={!chatModel || !chatInput.trim() || chatLoading}
                >
                  {chatLoading && !chatStreaming && <Spinner className="mr-2" />}
                  <SendIcon className="size-4" />
                </Button>
                <Button
                  onClick={() => handleSendChat(true)}
                  disabled={!chatModel || !chatInput.trim() || chatLoading}
                  variant="secondary"
                >
                  {chatStreaming && <Spinner className="mr-2" />}
                  <ZapIcon className="size-4" />
                  Stream
                </Button>
                {chatStreaming && (
                  <Button
                    onClick={handleAbortChat}
                    variant="destructive"
                  >
                    <SquareIcon className="size-4" />
                    Abort
                  </Button>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setChatMessages([]);
                  setChatResponse('');
                }}
              >
                Clear Chat
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="generate"
          className="mt-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
              <CardDescription>Generate text from a prompt</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Model:</span>
                <Select
                  value={generateModel}
                  onValueChange={(v) => v && setGenerateModel(v)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={model.name}
                        value={model.name}
                      >
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Temperature: {generateTemperature.toFixed(2)}</span>
                </div>
                <Slider
                  value={[generateTemperature]}
                  onValueChange={(v) => setGenerateTemperature(Array.isArray(v) ? (v[0] ?? 0.7) : v)}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>

              <Textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="Enter your prompt..."
                rows={4}
              />

              <div className="flex gap-2">
                <Button
                  onClick={() => handleGenerate(false)}
                  disabled={!generateModel || !generatePrompt.trim() || generateLoading}
                >
                  {generateLoading && !generateStreaming && <Spinner className="mr-2" />}
                  Generate
                </Button>
                <Button
                  onClick={() => handleGenerate(true)}
                  disabled={!generateModel || !generatePrompt.trim() || generateLoading}
                  variant="secondary"
                >
                  {generateStreaming && <Spinner className="mr-2" />}
                  <ZapIcon className="size-4" />
                  Stream
                </Button>
                {generateStreaming && (
                  <Button
                    onClick={handleAbortGenerate}
                    variant="destructive"
                  >
                    <SquareIcon className="size-4" />
                    Abort
                  </Button>
                )}
              </div>

              {generateResponse && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Response</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <p className="text-sm whitespace-pre-wrap">{generateResponse}</p>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="embeddings"
          className="mt-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Embeddings</CardTitle>
              <CardDescription>Generate vector embeddings for text</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Model:</span>
                <Select
                  value={embedModel}
                  onValueChange={(v) => v && setEmbedModel(v)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={model.name}
                        value={model.name}
                      >
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Textarea
                value={embedInput}
                onChange={(e) => setEmbedInput(e.target.value)}
                placeholder="Enter text to embed..."
                rows={3}
              />

              <Button
                onClick={handleEmbed}
                disabled={!embedModel || !embedInput.trim() || embedLoading}
              >
                {embedLoading && <Spinner className="mr-2" />}
                Generate Embeddings
              </Button>

              {embedError && (
                <Alert variant="destructive">
                  <AlertCircleIcon className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{embedError}</AlertDescription>
                </Alert>
              )}

              {embedResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Embedding Result</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">
                      <span className="font-medium">Vector length:</span> {embedResult.length} dimensions
                    </p>
                    <div>
                      <span className="text-sm font-medium">Preview (first 10 values):</span>
                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                        [{embedResult.preview.map((v) => v.toFixed(6)).join(', ')}...]
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

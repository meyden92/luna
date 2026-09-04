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
import { cn, formatSize } from '@/libs/utils';
import type { ChatStreamChunk, GenerateStreamChunk, Message, ModelInfo, OllamaStream } from '@/types/ollama';
import styles from './ollama.module.css';

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
    <section className="container pad-y-8">
      <h1 className="type-2xl weight-bold margin-bottom-6">Ollama Bridge Test Page</h1>

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
          className="margin-top-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Connection Status</CardTitle>
              <CardDescription>Check if the Ollama Bridge extension and server are available</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className="cluster space-4">
                <span className="type-sm weight-medium">Extension:</span>
                {isLoading ? (
                  <Badge variant="outline">
                    <Spinner />
                    Checking...
                  </Badge>
                ) : isAvailable ? (
                  <Badge className={styles.ok}>
                    <CheckCircleIcon />
                    Available
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertCircleIcon />
                    Not Available
                  </Badge>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="cluster space-4">
                <Button
                  onClick={handlePing}
                  disabled={!isAvailable || pingLoading}
                >
                  {pingLoading && <Spinner />}
                  Ping Server
                </Button>
                {pingResult !== null && (
                  <Badge
                    className={pingResult ? styles.ok : undefined}
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
          className="margin-top-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Available Models</CardTitle>
              <CardDescription>List and inspect models installed on your Ollama server</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              <Button
                onClick={handleLoadModels}
                disabled={!isAvailable || modelsLoading}
              >
                {modelsLoading && <Spinner />}
                Load Models
              </Button>

              {modelsError && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{modelsError}</AlertDescription>
                </Alert>
              )}

              <div className={styles.modelGrid}>
                {models.map((model) => (
                  <Card
                    key={model.name}
                    className={styles.modelCard}
                    data-selected={selectedModelDetails?.name === model.name}
                    onClick={() => setSelectedModelDetails(model)}
                  >
                    <CardHeader className="pad-y-2">
                      <CardTitle className="type-base">{model.name}</CardTitle>
                    </CardHeader>
                    <CardContent className={cn('stack space-1', styles.modelMeta)}>
                      <p>Size: {formatSize(model.size, MODEL_SIZE_OPTIONS)}</p>
                      <p>Parameters: {model.details.parameter_size}</p>
                      <p>Family: {model.details.family}</p>
                      <p>Quantization: {model.details.quantization_level}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedModelDetails && (
                <Card className="margin-top-4">
                  <CardHeader>
                    <CardTitle className="type-lg">Model Details: {selectedModelDetails.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className={styles.code}>{JSON.stringify(selectedModelDetails, null, 2)}</pre>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="chat"
          className="margin-top-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Chat</CardTitle>
              <CardDescription>Have a conversation with a model</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className="cluster space-4">
                <span className="type-sm weight-medium">Model:</span>
                <Select
                  value={chatModel}
                  onValueChange={(v) => v && setChatModel(v)}
                >
                  <SelectTrigger className={styles.modelSelect}>
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
                {models.length === 0 && <span className={styles.hint}>Load models first</span>}
              </div>

              <ScrollArea className={styles.chatLog}>
                <div className="stack space-4">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={styles.messageRow}
                      data-role={msg.role}
                    >
                      <div
                        className={styles.bubble}
                        data-role={msg.role}
                      >
                        <p className={styles.messageText}>{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {chatLoading && chatResponse && (
                    <div className={styles.messageRow}>
                      <div className={styles.bubble}>
                        <p className={styles.messageText}>{chatResponse}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="cluster space-2">
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
                  {chatLoading && !chatStreaming && <Spinner />}
                  <SendIcon />
                </Button>
                <Button
                  onClick={() => handleSendChat(true)}
                  disabled={!chatModel || !chatInput.trim() || chatLoading}
                  variant="secondary"
                >
                  {chatStreaming && <Spinner />}
                  <ZapIcon />
                  Stream
                </Button>
                {chatStreaming && (
                  <Button
                    onClick={handleAbortChat}
                    variant="destructive"
                  >
                    <SquareIcon />
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
          className="margin-top-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
              <CardDescription>Generate text from a prompt</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className="cluster space-4">
                <span className="type-sm weight-medium">Model:</span>
                <Select
                  value={generateModel}
                  onValueChange={(v) => v && setGenerateModel(v)}
                >
                  <SelectTrigger className={styles.modelSelect}>
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

              <div className="stack space-2">
                <span className="type-sm weight-medium">Temperature: {generateTemperature.toFixed(2)}</span>
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

              <div className="cluster space-2">
                <Button
                  onClick={() => handleGenerate(false)}
                  disabled={!generateModel || !generatePrompt.trim() || generateLoading}
                >
                  {generateLoading && !generateStreaming && <Spinner />}
                  Generate
                </Button>
                <Button
                  onClick={() => handleGenerate(true)}
                  disabled={!generateModel || !generatePrompt.trim() || generateLoading}
                  variant="secondary"
                >
                  {generateStreaming && <Spinner />}
                  <ZapIcon />
                  Stream
                </Button>
                {generateStreaming && (
                  <Button
                    onClick={handleAbortGenerate}
                    variant="destructive"
                  >
                    <SquareIcon />
                    Abort
                  </Button>
                )}
              </div>

              {generateResponse && (
                <Card>
                  <CardHeader>
                    <CardTitle className="type-base">Response</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className={styles.responseScroll}>
                      <p className={styles.messageText}>{generateResponse}</p>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="embeddings"
          className="margin-top-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Embeddings</CardTitle>
              <CardDescription>Generate vector embeddings for text</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className="cluster space-4">
                <span className="type-sm weight-medium">Model:</span>
                <Select
                  value={embedModel}
                  onValueChange={(v) => v && setEmbedModel(v)}
                >
                  <SelectTrigger className={styles.modelSelect}>
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
                {embedLoading && <Spinner />}
                Generate Embeddings
              </Button>

              {embedError && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{embedError}</AlertDescription>
                </Alert>
              )}

              {embedResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="type-base">Embedding Result</CardTitle>
                  </CardHeader>
                  <CardContent className="stack space-2">
                    <p className="type-sm">
                      <span className="weight-medium">Vector length:</span> {embedResult.length} dimensions
                    </p>
                    <div>
                      <span className="type-sm weight-medium">Preview (first 10 values):</span>
                      <pre
                        className={cn('margin-top-1', styles.code)}
                        data-density="compact"
                      >
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

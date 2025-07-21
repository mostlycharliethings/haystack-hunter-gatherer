import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ExternalLink, Eye, EyeOff, MessageSquare, Search, Globe } from 'lucide-react';
import { useWidenetResults, WidenetResult } from '@/hooks/useWidenetResults';

interface WidenetResultsProps {
  searchConfigId: string;
  searchConfigName: string;
}

export const WidenetResults = ({ searchConfigId, searchConfigName }: WidenetResultsProps) => {
  const { results, loading, markAsVisited, addNote } = useWidenetResults(searchConfigId);
  const [selectedResult, setSelectedResult] = useState<WidenetResult | null>(null);
  const [noteText, setNoteText] = useState('');

  const handleVisitResult = (result: WidenetResult) => {
    markAsVisited(result.id);
    window.open(result.url, '_blank');
  };

  const handleSaveNote = async () => {
    if (selectedResult && noteText.trim()) {
      await addNote(selectedResult.id, noteText.trim());
      setSelectedResult(null);
      setNoteText('');
    }
  };

  const openNoteDialog = (result: WidenetResult) => {
    setSelectedResult(result);
    setNoteText(result.notes || '');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-muted-foreground">Loading widenet results...</div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            WideNet Search Results
          </CardTitle>
          <CardDescription>
            No Google search results found for {searchConfigName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No results available yet. Run the WideNet Explorer module to discover web search results.
          </div>
        </CardContent>
      </Card>
    );
  }

  const visitedCount = results.filter(r => r.is_visited).length;
  const latestQuery = results[0]?.search_query;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            WideNet Search Results
          </div>
          <Badge variant="outline">
            {results.length} results
          </Badge>
        </CardTitle>
        <CardDescription>
          Google search results for: <span className="font-mono">{latestQuery}</span>
        </CardDescription>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {visitedCount} visited
          </div>
          <div className="flex items-center gap-1">
            <EyeOff className="h-4 w-4" />
            {results.length - visitedCount} unvisited
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {results.map((result) => (
              <div 
                key={result.id} 
                className={`p-4 border rounded-lg transition-colors ${
                  result.is_visited ? 'bg-muted/30' : 'bg-background'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        #{result.position}
                      </Badge>
                      {result.is_visited && (
                        <Badge variant="secondary" className="text-xs">
                          Visited
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-medium text-sm leading-relaxed">
                      {result.title}
                    </h4>
                    {result.snippet && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {result.snippet}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      <span className="truncate">{result.url}</span>
                    </div>
                    {result.notes && (
                      <div className="flex items-start gap-1 text-xs">
                        <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{result.notes}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVisitResult(result)}
                      className="text-xs"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Visit
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openNoteDialog(result)}
                          className="text-xs"
                        >
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Note
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Note</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="text-sm">
                            <p className="font-medium">{selectedResult?.title}</p>
                            <p className="text-muted-foreground text-xs">{selectedResult?.url}</p>
                          </div>
                          <Textarea
                            placeholder="Add your notes about this result..."
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={4}
                          />
                          <div className="flex gap-2">
                            <Button onClick={handleSaveNote} size="sm">
                              Save Note
                            </Button>
                            <Button variant="outline" onClick={() => setSelectedResult(null)} size="sm">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
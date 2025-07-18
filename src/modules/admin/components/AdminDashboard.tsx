import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Settings, 
  Activity, 
  BarChart3, 
  Database, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock,
  Search
} from 'lucide-react';
import { useSearchConfigs } from '@/hooks/useSearchConfigs';
import { useListings } from '@/hooks/useListings';
import { supabase } from '@/integrations/supabase/client';

interface ModuleStatus {
  name: string;
  enabled: boolean;
  lastRun?: string;
  successRate: number;
  description: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  module: string;
  level: string;
  message: string;
}

export const AdminDashboard = () => {
  const { configs } = useSearchConfigs();
  const { listings } = useListings();
  
  const [modules, setModules] = useState<ModuleStatus[]>([
    {
      name: 'Primary Search',
      enabled: true,
      lastRun: undefined,
      successRate: 0,
      description: 'Main search crawler for marketplace listings'
    },
    {
      name: 'Extended Search',
      enabled: true,
      lastRun: undefined,
      successRate: 0,
      description: 'Secondary search with expanded parameters'
    },
    {
      name: 'Discovery Crawler',
      enabled: true,
      lastRun: undefined,
      successRate: 0,
      description: 'New source discovery and validation'
    },
    {
      name: 'Contextual Finder',
      enabled: false,
      lastRun: undefined,
      successRate: 0,
      description: 'AI-powered contextual search refinement'
    },
    {
      name: 'Price Suggester',
      enabled: true,
      lastRun: undefined,
      successRate: 0,
      description: 'Dynamic price threshold recommendations'
    },
    {
      name: 'Notifier',
      enabled: true,
      lastRun: undefined,
      successRate: 0,
      description: 'Email notification service'
    }
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    fetchEdgeFunctionLogs();
  }, []);

  const fetchEdgeFunctionLogs = async () => {
    setIsLoadingLogs(true);
    try {
      // Fetch logs from different edge functions
      const functionNames = [
        'primary-search',
        'extended-search', 
        'discovery-crawler',
        'contextual-finder',
        'price-suggester',
        'notifier'
      ];

      const allLogs: LogEntry[] = [];

      for (const functionName of functionNames) {
        try {
          const { data } = await supabase.functions.invoke('get-function-logs', {
            body: { functionName }
          });
          
          if (data?.logs) {
            const formattedLogs = data.logs.map((log: any, index: number) => ({
              id: `${functionName}-${index}`,
              timestamp: new Date(log.timestamp).toLocaleString(),
              module: functionName.split('-').map((word: string) => 
                word.charAt(0).toUpperCase() + word.slice(1)
              ).join(' '),
              level: log.level || 'INFO',
              message: log.message || log.event_message || 'Execution completed'
            }));
            allLogs.push(...formattedLogs);
          }
        } catch (error) {
          console.log(`No logs available for ${functionName}`);
        }
      }

      // Sort by timestamp descending
      allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(allLogs.slice(0, 50)); // Keep only recent 50 logs
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const toggleModule = (moduleName: string) => {
    setModules(prev => prev.map(module => 
      module.name === moduleName 
        ? { ...module, enabled: !module.enabled }
        : module
    ));
  };

  const runModule = async (moduleName: string) => {
    const functionName = moduleName.toLowerCase().replace(/\s+/g, '-');
    console.log(`Manually invoking ${functionName}`);
    
    try {
      const { data, error } = await supabase.functions.invoke(functionName);
      if (error) {
        console.error(`Error invoking ${functionName}:`, error);
      } else {
        console.log(`Successfully invoked ${functionName}:`, data);
        // Refresh logs after manual invocation
        setTimeout(() => fetchEdgeFunctionLogs(), 2000);
      }
    } catch (error) {
      console.error(`Failed to invoke ${functionName}:`, error);
    }
  };

  const activeConfigsCount = configs?.filter(config => config.is_active).length || 0;
  const totalListingsToday = listings?.filter(listing => {
    const today = new Date().toDateString();
    return new Date(listing.discovered_at).toDateString() === today;
  }).length || 0;
  
  const totalListings = listings?.length || 0;
  const enabledModules = modules.filter(m => m.enabled).length;

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'destructive';
      case 'WARNING': return 'secondary';
      case 'SUCCESS': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Modules</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {enabledModules}/{modules.length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeConfigsCount}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Listings Today</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalListingsToday}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalListings > 0 ? 'Live' : 'No Data'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList>
          <TabsTrigger value="modules">Module Control</TabsTrigger>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="modules" className="space-y-4">
          <div className="grid gap-4">
            {modules.map((module) => (
              <Card key={module.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{module.name}</CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={module.enabled ? "default" : "secondary"}>
                        {module.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Switch
                        checked={module.enabled}
                        onCheckedChange={() => toggleModule(module.name)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Last run: {module.lastRun || 'No recent activity'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Database className="h-4 w-4" />
                        Status: {module.enabled ? 'Active' : 'Disabled'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runModule(module.name)}
                      disabled={!module.enabled}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Run Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Execution Logs</CardTitle>
              <CardDescription>
                {isLoadingLogs ? 'Loading real-time logs...' : `Showing ${logs.length} recent entries`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {isLoadingLogs ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">Loading logs...</div>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">No logs available yet</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="mt-1">
                          {log.level === 'ERROR' && <XCircle className="h-4 w-4 text-destructive" />}
                          {log.level === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {log.level === 'WARNING' && <Clock className="h-4 w-4 text-yellow-500" />}
                          {log.level === 'INFO' && <Activity className="h-4 w-4 text-blue-500" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={getLogLevelColor(log.level)} className="text-xs">
                              {log.level}
                            </Badge>
                            <span className="text-sm font-medium">{log.module}</span>
                            <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{log.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="performance">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
                <CardDescription>
                  Current system health and data statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Database Connection</h4>
                      <p className="text-sm text-muted-foreground">Supabase connection status</p>
                    </div>
                    <Badge variant="default">Connected</Badge>
                  </div>
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Active Search Configurations</h4>
                      <p className="text-sm text-muted-foreground">Currently active search specs</p>
                    </div>
                    <Badge variant={activeConfigsCount > 0 ? "default" : "secondary"}>
                      {activeConfigsCount}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Total Listings</h4>
                      <p className="text-sm text-muted-foreground">All discovered listings</p>
                    </div>
                    <Badge variant={totalListings > 0 ? "default" : "secondary"}>
                      {totalListings}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
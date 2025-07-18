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

interface ModuleStatus {
  name: string;
  enabled: boolean;
  lastRun?: string;
  successRate: number;
  description: string;
}

export const AdminDashboard = () => {
  const { configs } = useSearchConfigs();
  const { listings } = useListings();
  
  const [modules, setModules] = useState<ModuleStatus[]>([
    {
      name: 'Primary Search',
      enabled: true,
      lastRun: '2 minutes ago',
      successRate: 94.2,
      description: 'Main search crawler for marketplace listings'
    },
    {
      name: 'Extended Search',
      enabled: true,
      lastRun: '5 minutes ago',
      successRate: 87.5,
      description: 'Secondary search with expanded parameters'
    },
    {
      name: 'Discovery Crawler',
      enabled: true,
      lastRun: '1 hour ago',
      successRate: 91.8,
      description: 'New source discovery and validation'
    },
    {
      name: 'Contextual Finder',
      enabled: false,
      lastRun: '3 hours ago',
      successRate: 78.3,
      description: 'AI-powered contextual search refinement'
    },
    {
      name: 'Price Suggester',
      enabled: true,
      lastRun: '30 minutes ago',
      successRate: 96.1,
      description: 'Dynamic price threshold recommendations'
    },
    {
      name: 'Notifier',
      enabled: true,
      lastRun: '10 minutes ago',
      successRate: 99.2,
      description: 'Email notification service'
    }
  ]);

  const [logs] = useState([
    { id: 1, timestamp: '2024-01-18 14:30:22', module: 'Primary Search', level: 'INFO', message: 'Successfully processed 142 listings' },
    { id: 2, timestamp: '2024-01-18 14:25:15', module: 'Notifier', level: 'SUCCESS', message: 'Email sent to user@example.com' },
    { id: 3, timestamp: '2024-01-18 14:20:08', module: 'Price Suggester', level: 'INFO', message: 'Generated suggestions for BMW 3 Series' },
    { id: 4, timestamp: '2024-01-18 14:15:33', module: 'Extended Search', level: 'WARNING', message: 'Rate limit exceeded, retrying in 60s' },
    { id: 5, timestamp: '2024-01-18 14:10:45', module: 'Discovery Crawler', level: 'ERROR', message: 'Failed to connect to source: marketplace.example.com' },
  ]);

  const toggleModule = (moduleName: string) => {
    setModules(prev => prev.map(module => 
      module.name === moduleName 
        ? { ...module, enabled: !module.enabled }
        : module
    ));
  };

  const runModule = (moduleName: string) => {
    console.log(`Manually invoking ${moduleName}`);
    // In a real implementation, this would trigger the actual module
  };

  const activeConfigsCount = configs?.filter(config => config.is_active).length || 0;
  const totalListingsToday = listings?.filter(listing => {
    const today = new Date().toDateString();
    return new Date(listing.discovered_at).toDateString() === today;
  }).length || 0;

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
              {modules.filter(m => m.enabled).length}/{modules.length}
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
              {(modules.reduce((acc, m) => acc + m.successRate, 0) / modules.length).toFixed(1)}%
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
                        Last run: {module.lastRun || 'Never'}
                      </div>
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-4 w-4" />
                        Success rate: {module.successRate}%
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
                Real-time module execution logs and status updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
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
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="performance">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Module Performance Metrics</CardTitle>
                <CardDescription>
                  Success rates and performance statistics for each module
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {modules.map((module) => (
                    <div key={module.name} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{module.name}</span>
                        <span>{module.successRate}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${module.successRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
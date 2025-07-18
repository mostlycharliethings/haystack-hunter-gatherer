import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Edit, Trash2 } from "lucide-react";

interface SearchConfig {
  id: string;
  brand: string;
  model: string;
  qualifier?: string;
  subQualifier?: string;
  yearStart?: string;
  yearEnd?: string;
  priceThreshold: number;
  priceMultiplier: number;
  location?: string;
  isActive: boolean;
  createdAt: string;
  lastRun?: string;
  listingCount: number;
}

interface SearchConfigListProps {
  configs: SearchConfig[];
  onEdit: (config: SearchConfig) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

export function SearchConfigList({ configs, onEdit, onDelete, onToggleActive }: SearchConfigListProps) {
  const formatSearchTerm = (config: SearchConfig) => {
    const parts = [config.brand, config.model];
    if (config.qualifier) parts.push(config.qualifier);
    if (config.subQualifier) parts.push(config.subQualifier);
    return parts.join(" ");
  };

  const formatYearRange = (config: SearchConfig) => {
    if (config.yearStart && config.yearEnd) {
      return `${config.yearStart}-${config.yearEnd}`;
    }
    if (config.yearStart) {
      return `${config.yearStart}+`;
    }
    if (config.yearEnd) {
      return `up to ${config.yearEnd}`;
    }
    return null;
  };

  const formatPriceRange = (config: SearchConfig) => {
    const maxPrice = Math.round(config.priceThreshold * config.priceMultiplier);
    return `$${config.priceThreshold.toLocaleString()} - $${maxPrice.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Saved Searches</h2>
        <Badge variant="secondary">{configs.length} configurations</Badge>
      </div>
      
      {configs.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No search configurations yet. Create your first one above!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs.map((config) => (
            <Card key={config.id} className={config.isActive ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{formatSearchTerm(config)}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={config.isActive ? "default" : "secondary"}>
                      {config.isActive ? "Active" : "Paused"}
                    </Badge>
                    <Badge variant="outline">{config.listingCount} listings</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Price Range:</span>
                      <p className="font-medium">{formatPriceRange(config)}</p>
                    </div>
                    {formatYearRange(config) && (
                      <div>
                        <span className="text-muted-foreground">Years:</span>
                        <p className="font-medium">{formatYearRange(config)}</p>
                      </div>
                    )}
                    {config.location && (
                      <div>
                        <span className="text-muted-foreground">Location:</span>
                        <p className="font-medium">{config.location}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Created:</span>
                      <p className="font-medium">
                        {new Date(config.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {config.lastRun && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Last search:</span>
                      <span className="font-medium ml-1">
                        {new Date(config.lastRun).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant={config.isActive ? "outline" : "default"}
                      size="sm"
                      onClick={() => onToggleActive(config.id, !config.isActive)}
                    >
                      {config.isActive ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Resume
                        </>
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(config)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(config.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
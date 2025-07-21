import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const searchConfigSchema = z.object({
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),
  qualifier: z.string().optional(),
  subQualifier: z.string().optional(),
  yearStart: z.string().optional(),
  yearEnd: z.string().optional(),
  priceThreshold: z.number().min(1, "Price threshold must be greater than 0"),
  priceMultiplier: z.number().min(1).max(6).default(1),
  location: z.string().optional(),
  email: z.string().email("Please enter a valid email address").min(1, "Email is required"),
});

type SearchConfigFormData = z.infer<typeof searchConfigSchema>;

interface SearchConfigFormProps {
  onSubmit: (data: SearchConfigFormData) => void;
  initialData?: Partial<SearchConfigFormData>;
}

export function SearchConfigForm({ onSubmit, initialData }: SearchConfigFormProps) {
  const { toast } = useToast();
  const [priceMultiplier, setPriceMultiplier] = useState(initialData?.priceMultiplier || 1);
  const [isGettingPriceSuggestions, setIsGettingPriceSuggestions] = useState(false);
  const [priceSuggestions, setPriceSuggestions] = useState<any>(null);

  const form = useForm<SearchConfigFormData>({
    resolver: zodResolver(searchConfigSchema),
    defaultValues: {
      brand: initialData?.brand || "",
      model: initialData?.model || "",
      qualifier: initialData?.qualifier || "",
      subQualifier: initialData?.subQualifier || "",
      yearStart: initialData?.yearStart || "",
      yearEnd: initialData?.yearEnd || "",
      priceThreshold: initialData?.priceThreshold || 1000,
      priceMultiplier: initialData?.priceMultiplier || 1,
      location: initialData?.location || "",
      email: initialData?.email || "",
    },
  });

  const handleSubmit = (data: SearchConfigFormData) => {
    onSubmit(data);
    
    // Reset the form to initial state after successful submission
    form.reset({
      brand: "",
      model: "",
      qualifier: "",
      subQualifier: "",
      yearStart: "",
      yearEnd: "",
      priceThreshold: 1000,
      priceMultiplier: 1,
      location: "",
      email: "",
    });
    
    // Reset local component state
    setPriceMultiplier(1);
    setPriceSuggestions(null);
    
    toast({
      title: "Search Configuration Saved",
      description: "Your search criteria have been saved successfully. The form has been reset for your next search.",
    });
  };

  const handlePriceMultiplierChange = (value: number[]) => {
    const newValue = value[0];
    setPriceMultiplier(newValue);
    form.setValue("priceMultiplier", newValue);
  };

  const calculatedMaxPrice = Math.round(form.watch("priceThreshold") * priceMultiplier);

  const getPriceSuggestions = async () => {
    const currentValues = form.getValues();
    
    if (!currentValues.brand || !currentValues.model) {
      toast({
        title: "Missing Information",
        description: "Please enter at least a brand and model to get price suggestions.",
        variant: "destructive",
      });
      return;
    }

    setIsGettingPriceSuggestions(true);
    setPriceSuggestions(null);

    try {
      const { data, error } = await supabase.functions.invoke('price-suggester', {
        body: {
          brand: currentValues.brand,
          model: currentValues.model,
          qualifier: currentValues.qualifier || undefined,
          sub_qualifier: currentValues.subQualifier || undefined,
          year_start: currentValues.yearStart ? parseInt(currentValues.yearStart) : undefined,
          year_end: currentValues.yearEnd ? parseInt(currentValues.yearEnd) : undefined,
          location: currentValues.location || undefined,
        }
      });

      if (error) {
        throw error;
      }

      setPriceSuggestions(data);
      toast({
        title: "Price Suggestions Ready",
        description: "AI-powered price recommendations have been generated!",
      });
    } catch (error) {
      console.error('Error getting price suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to get price suggestions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGettingPriceSuggestions(false);
    }
  };

  const applyPriceSuggestion = (threshold: number, multiplier: number) => {
    form.setValue("priceThreshold", threshold);
    form.setValue("priceMultiplier", multiplier);
    setPriceMultiplier(multiplier);
    toast({
      title: "Price Settings Applied",
      description: `Set threshold to $${threshold.toLocaleString()} with ${((multiplier - 1) * 100).toFixed(0)}% above threshold`,
    });
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Search Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Basic Search Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Honda, Apple, Canon" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Civic, iPhone, EOS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="qualifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualifier</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sport, Pro, XL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="subQualifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-Qualifier</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Manual, 128GB, Black" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Year Range */}
            <div className="space-y-2">
              <Label>Year Range (Optional)</Label>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="yearStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="Start year" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="yearEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="End year" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Price Configuration */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="priceThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price Threshold ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="1000"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Price Range Multiplier: {((priceMultiplier - 1) * 100).toFixed(0)}% above threshold</Label>
                <div className="px-2">
                  <Slider
                    value={[priceMultiplier]}
                    onValueChange={handlePriceMultiplierChange}
                    max={6}
                    min={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>0% (${form.watch("priceThreshold")?.toLocaleString() || "0"})</span>
                  <span>250%</span>
                  <span>500% (${calculatedMaxPrice.toLocaleString()})</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Search range: ${form.watch("priceThreshold")?.toLocaleString() || "0"} - ${calculatedMaxPrice.toLocaleString()}
                </p>
              </div>

              {/* Price Suggestions Button */}
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={getPriceSuggestions}
                  disabled={isGettingPriceSuggestions}
                  className="flex items-center gap-2"
                >
                  {isGettingPriceSuggestions ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lightbulb className="h-4 w-4" />
                  )}
                  {isGettingPriceSuggestions ? "Getting Price Suggestions..." : "Help Me Find a Price"}
                </Button>
              </div>
            </div>

            {/* Price Suggestions Display */}
            {priceSuggestions && (
              <Alert className="border-blue-200 bg-blue-50">
                <Lightbulb className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm mb-2">
                        AI Price Analysis for {priceSuggestions.vehicle_description} ({priceSuggestions.year_range})
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        {priceSuggestions.market_analysis}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Card className="p-3 border-green-200 bg-green-50">
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-700">
                            ${priceSuggestions.conservative_threshold?.toLocaleString()}
                          </div>
                          <div className="text-xs text-green-600 mb-2">Conservative</div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => applyPriceSuggestion(
                              priceSuggestions.conservative_threshold,
                              priceSuggestions.multiplier_suggestion
                            )}
                            className="text-xs h-7"
                          >
                            Apply
                          </Button>
                        </div>
                      </Card>

                      <Card className="p-3 border-blue-200 bg-blue-50">
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-700">
                            ${priceSuggestions.suggested_threshold?.toLocaleString()}
                          </div>
                          <div className="text-xs text-blue-600 mb-2">Recommended</div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => applyPriceSuggestion(
                              priceSuggestions.suggested_threshold,
                              priceSuggestions.multiplier_suggestion
                            )}
                            className="text-xs h-7"
                          >
                            Apply
                          </Button>
                        </div>
                      </Card>

                      <Card className="p-3 border-orange-200 bg-orange-50">
                        <div className="text-center">
                          <div className="text-lg font-bold text-orange-700">
                            ${priceSuggestions.aggressive_threshold?.toLocaleString()}
                          </div>
                          <div className="text-xs text-orange-600 mb-2">Aggressive</div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => applyPriceSuggestion(
                              priceSuggestions.aggressive_threshold,
                              priceSuggestions.multiplier_suggestion
                            )}
                            className="text-xs h-7"
                          >
                            Apply
                          </Button>
                        </div>
                      </Card>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <div className="mb-1">
                        <strong>Market Range:</strong> ${priceSuggestions.price_range?.low?.toLocaleString()} - ${priceSuggestions.price_range?.high?.toLocaleString()} 
                        (avg: ${priceSuggestions.price_range?.average?.toLocaleString()})
                      </div>
                      <div className="mb-1">
                        <strong>Recommended Multiplier:</strong> {priceSuggestions.multiplier_suggestion}x
                      </div>
                      <div>
                        <strong>Reasoning:</strong> {priceSuggestions.reasoning}
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Location Override */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Override</FormLabel>
                  <FormControl>
                    <Input placeholder="Leave blank to use browser location" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email for Notifications */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email for Notifications *</FormLabel>
                  <FormControl>
                    <Input 
                      type="email" 
                      placeholder="your.email@example.com" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">
              Feed Me Haystacks!
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
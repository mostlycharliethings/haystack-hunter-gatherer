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

const searchConfigSchema = z.object({
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),
  qualifier: z.string().optional(),
  subQualifier: z.string().optional(),
  yearStart: z.string().optional(),
  yearEnd: z.string().optional(),
  priceThreshold: z.number().min(1, "Price threshold must be greater than 0"),
  priceMultiplier: z.number().min(0.01).max(5).default(1),
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
    // Ensure price multiplier is at least 1.0 if set to 0
    const finalData = {
      ...data,
      priceMultiplier: data.priceMultiplier === 0 ? 1.0 : data.priceMultiplier,
    };
    
    onSubmit(finalData);
    toast({
      title: "Search Configuration Saved",
      description: "Your search criteria have been saved successfully.",
    });
  };

  const handlePriceMultiplierChange = (value: number[]) => {
    const newValue = value[0];
    setPriceMultiplier(newValue);
    form.setValue("priceMultiplier", newValue);
  };

  const calculatedMaxPrice = Math.round(form.watch("priceThreshold") * priceMultiplier);

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
                <Label>Price Range Multiplier: {priceMultiplier.toFixed(2)}x</Label>
                <div className="px-2">
                  <Slider
                    value={[priceMultiplier]}
                    onValueChange={handlePriceMultiplierChange}
                    max={5}
                    min={0}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>0%</span>
                  <span>100%</span>
                  <span>500%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Max price: ${calculatedMaxPrice.toLocaleString()}
                </p>
              </div>
            </div>

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
              Save Search Configuration
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
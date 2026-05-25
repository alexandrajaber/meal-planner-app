import type { NextApiRequest, NextApiResponse } from 'next'

type Recipe = {
  id: number
  name: string
  link: string | null
  multiplier: number
  ingredients: string[] | null
}

type MealPlanDay = {
  date: string
  day: string
  away: boolean
  dinner?: string
  dinnerLink?: string
  category?: string
  isLeftover?: boolean
  leftoverDay?: number
  babyMeals?: string[]
  babySnacks?: string[]
}

// Detect meal category based on ingredients
function detectCategory(ingredients: string[] | null): string {
  if (!ingredients) return 'other'
  if (!Array.isArray(ingredients)) return 'other'
  
  const ingredientsText = ingredients.join(' ').toLowerCase()
  
  if (ingredientsText.match(/beef|chicken|pork|lamb|turkey|sausage|bacon|mince/)) return 'meat'
  if (ingredientsText.match(/fish|salmon|tuna|prawn|shrimp|cod|haddock/)) return 'seafood'
  if (ingredientsText.match(/pasta|rice|gnocchi|noodles/)) return 'carbs'
  if (ingredientsText.match(/bean|lentil|chickpea|tofu/) && !ingredientsText.match(/beef|chicken|pork|fish/)) return 'vegetarian'
  
  return 'other'
}

// Convert cups/tablespoons to grams/liters (approximate)
function convertToMetric(ingredient: string): string {
  const lowerIngredient = ingredient.toLowerCase()
  
  // Check if it's a liquid
  const isLiquid = lowerIngredient.match(/\b(water|milk|cream|oil|stock|broth|vodka|wine|juice|sauce|vinegar|coconut milk)\b/)
  
  // Convert cups
  ingredient = ingredient.replace(/(\d+(?:\/\d+)?)\s*cups?/gi, (match, num) => {
    const cups = eval(num) // Convert fractions like 1/4
    if (isLiquid) {
      const ml = Math.round(cups * 240)
      return ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}ml`
    } else {
      const grams = Math.round(cups * 240)
      return `${grams}g`
    }
  })
  
  // Convert tablespoons
  ingredient = ingredient.replace(/(\d+(?:\/\d+)?)\s*tablespoons?/gi, (match, num) => {
    const tbsp = eval(num)
    if (isLiquid) {
      const ml = Math.round(tbsp * 15)
      return `${ml}ml`
    } else {
      const grams = Math.round(tbsp * 15)
      return `${grams}g`
    }
  })
  
  // Convert teaspoons
  ingredient = ingredient.replace(/(\d+(?:\/\d+)?)\s*teaspoons?/gi, (match, num) => {
    const tsp = eval(num)
    if (isLiquid) {
      const ml = Math.round(tsp * 5)
      return `${ml}ml`
    } else {
      const grams = Math.round(tsp * 5)
      return `${grams}g`
    }
  })
  
  return ingredient
}

// Multiply ingredient quantities
function multiplyIngredient(ingredient: string, multiplier: number): string {
  if (multiplier === 1) return ingredient
  
  // Match numbers with units (g, ml, L, kg)
  ingredient = ingredient.replace(/(\d+(?:\.\d+)?)\s*(g|ml|L|kg)/gi, (match, num, unit) => {
    const amount = parseFloat(num) * multiplier
    // Convert to larger unit if needed
    if (unit.toLowerCase() === 'g' && amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}kg`
    }
    if (unit.toLowerCase() === 'ml' && amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}L`
    }
    return `${Math.round(amount)}${unit}`
  })
  
  // Match plain numbers at the start (e.g., "4 cloves garlic")
  ingredient = ingredient.replace(/^(\d+(?:\.\d+)?)\s+/,  (match, num) => {
    const amount = parseFloat(num) * multiplier
    return `${Math.round(amount)} `
  })
  
  return ingredient
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { recipes, awayDays, startDate, nurseryDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], dayMultipliers = {}, existingMealPlan = null } = req.body

  try {
    const mealPlan: MealPlanDay[] = []
    const shoppingList: Record<string, string> = {}
    
    const start = new Date(startDate)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    // Categorize recipes by type
    const adultRecipes: Recipe[] = recipes.adult || []
    const babyRecipes: Recipe[] = recipes.babyRecipe || []
    const babySnacks: Recipe[] = recipes.babySnack || []
    
    // Parse ingredients if they're JSON strings (from Supabase text[] columns)
    const parseIngredients = (recipe: Recipe): Recipe => {
      if (recipe.ingredients && typeof recipe.ingredients === 'string') {
        try {
          // Parse once
          let parsed = JSON.parse(recipe.ingredients as any)
          
          // Check if it's still a string (double-stringified)
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed)
          }
          
          // If it's an array with a single long string, split by commas
          if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
            const str = parsed[0]
            // Check if it's a mega-string with "," patterns
            if (str.includes('","') || str.includes('","')) {
              parsed = str.split(/","|","/).map((s: string) => 
                s.replace(/^\[?"/, '').replace(/"\]?$/, '').trim()
              )
            }
          }
          
          // Clean up each item
          if (Array.isArray(parsed)) {
            parsed = parsed.map((item: string) => {
              if (typeof item !== 'string') return String(item)
              
              // Remove all escape patterns and clean up
              let cleaned = item
                .replace(/^▢\s*/, '')                    // Remove checkbox
                .replace(/^\[\s*"*/, '')                 // Remove opening ["
                .replace(/"*\s*\]$/, '')                 // Remove closing "]
                .replace(/\\\\/g, '')                    // Remove double backslashes
                .replace(/\\"/g, '"')                    // Unescape quotes
                .replace(/\\n/g, '')                     // Remove newline escapes
                .replace(/\[\\"/g, '')                   // Remove [\" patterns
                .replace(/\\"\]/g, '')                   // Remove \"] patterns
                .replace(/^\["/, '')                     // Remove ["
                .replace(/"\]$/, '')                     // Remove "]
                .replace(/^"/, '')                       // Remove leading quote
                .replace(/"$/, '')                       // Remove trailing quote
                .trim()
              
              // If still has weird patterns, try splitting by common separators
              if (cleaned.includes('","') && !cleaned.match(/^\d+/)) {
                // This looks like multiple items mashed together
                return cleaned.split('","').map(s => s.replace(/"/g, '').trim())
              }
              
              return cleaned
            }).flat().filter((item: string) => item.length > 0 && !item.match(/^[\[\]"\\]+$/))
          }
          
          recipe.ingredients = parsed
        } catch (e) {
          console.error('Failed to parse ingredients:', e)
        }
      } else if (Array.isArray(recipe.ingredients)) {
        // Clean existing arrays too
        recipe.ingredients = recipe.ingredients.map((item: string) => {
          if (typeof item !== 'string') return String(item)
          
          let cleaned = item
            .replace(/^▢\s*/, '')
            .replace(/\\\\/g, '')
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '')
            .replace(/\[\\"/g, '')
            .replace(/\\"\]/g, '')
            .replace(/^\["/, '')
            .replace(/"\]$/, '')
            .replace(/^"/, '')
            .replace(/"$/, '')
            .trim()
          
          // Split if it looks like multiple items
          if (cleaned.includes('","') && !cleaned.match(/^\d+/)) {
            return cleaned.split('","').map(s => s.replace(/"/g, '').trim())
          }
          
          return cleaned
        }).flat().filter((item: string) => item.length > 0)
      }
      return recipe
    }
    
    adultRecipes.forEach(parseIngredients)
    babyRecipes.forEach(parseIngredients)
    babySnacks.forEach(parseIngredients)
    
    // Create balanced meal rotation - cook 2-3 times per week
    // Each recipe covers multiple days based on its multiplier
    // multiplier 1 = 1 day, multiplier 2 = 2 days, multiplier 3 = 3 days
    let recipeIndex = 0
    let babyMealIndex = 0
    let babySnackIndex = 0
    
    let currentRecipeDay = 0
    let currentRecipe: Recipe | null = null
    let daysRemainingForRecipe = 0
    
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(start)
      currentDate.setDate(start.getDate() + i)
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayName = dayNames[currentDate.getDay()]
      
      // Check if this is an away day
      const isAway = awayDays.some((day: string) => day === dateStr)
      
      if (isAway) {
        mealPlan.push({
          date: dateStr,
          day: dayName,
          away: true
        })
        // Reset recipe counter if we're away
        daysRemainingForRecipe = 0
        currentRecipe = null
        continue
      }
      
      // Select dinner recipe - pick a new one only when needed
      if (adultRecipes.length > 0) {
        // Do we need a new recipe?
        if (daysRemainingForRecipe === 0 || !currentRecipe) {
          currentRecipe = adultRecipes[recipeIndex % adultRecipes.length]
          console.log('🔵 Selected recipe:', currentRecipe.name)
          console.log('🔵 Recipe ingredients:', currentRecipe.ingredients)
          console.log('🔵 Is array?', Array.isArray(currentRecipe.ingredients))
          recipeIndex++
          
          // Calculate days covered: servings ÷ 2 (assuming 2 people eating)
          // 2 servings = 1 day, 4 servings = 2 days, 6 servings = 3 days
          const servings = currentRecipe.multiplier || 2
          daysRemainingForRecipe = Math.max(1, Math.round(servings / 2))
          currentRecipeDay = 0
          
          console.log(`🔵 Recipe has ${servings} servings → covers ${daysRemainingForRecipe} days`)
        }
        
        const recipe = currentRecipe
        currentRecipeDay++
        daysRemainingForRecipe--
        
        // Detect category from ingredients
        const category = detectCategory(recipe.ingredients)
        
        // BABY MEALS LOGIC
        const isWeekend = dayName === 'Saturday' || dayName === 'Sunday'
        const isNurseryDay = nurseryDays.includes(dayName)
        
        // Baby meals: 2 on weekends or non-nursery days, 1 on nursery days
        const numBabyMeals = (isWeekend || !isNurseryDay) ? 2 : 1
        const babyMealsList: string[] = []
        
        if (babyRecipes.length > 0) {
          for (let m = 0; m < numBabyMeals; m++) {
            const babyMeal = babyRecipes[babyMealIndex % babyRecipes.length]
            babyMealsList.push(babyMeal.name)
            
            // Add baby meal ingredients to shopping list
            if (babyMeal.ingredients && Array.isArray(babyMeal.ingredients)) {
              babyMeal.ingredients.forEach(ingredient => {
                const key = ingredient.toLowerCase()
                if (!shoppingList[key]) {
                  shoppingList[key] = ingredient
                }
              })
            }
            
            // Rotate baby meals slowly (can repeat 2-3 days)
            if (i % 2 === 1) babyMealIndex++
          }
        }
        
        // BABY SNACKS LOGIC: Always 2 different snacks per day
        const babySnacksList: string[] = []
        if (babySnacks.length > 0) {
          // Pick 2 different snacks
          for (let s = 0; s < 2; s++) {
            const snack = babySnacks[(babySnackIndex + s) % babySnacks.length]
            babySnacksList.push(snack.name)
            
            // Add snack ingredients to shopping list
            if (snack.ingredients && Array.isArray(snack.ingredients)) {
              snack.ingredients.forEach(ingredient => {
                const key = ingredient.toLowerCase()
                if (!shoppingList[key]) {
                  shoppingList[key] = ingredient
                }
              })
            }
          }
          
          // Rotate snacks every day to get variety throughout the week
          // This ensures different combinations each day
          babySnackIndex += 1
        }
        
        mealPlan.push({
          date: dateStr,
          day: dayName,
          away: false,
          dinner: recipe.name,
          dinnerLink: recipe.link || undefined,
          category,
          isLeftover: currentRecipeDay > 1,
          leftoverDay: currentRecipeDay,
          babyMeals: babyMealsList.length > 0 ? babyMealsList : undefined,
          babySnacks: babySnacksList.length > 0 ? babySnacksList : undefined
        })
        
        // Add adult recipe ingredients to shopping list ONLY on the first day
        if (currentRecipeDay === 1 && recipe.ingredients && Array.isArray(recipe.ingredients)) {
          recipe.ingredients.forEach(ingredient => {
            const converted = convertToMetric(ingredient)
            const dayMultiplier = dayMultipliers[dateStr] || 1
            const multiplied = multiplyIngredient(converted, recipe.multiplier * dayMultiplier)
            const key = multiplied.toLowerCase()
            if (!shoppingList[key]) {
              shoppingList[key] = multiplied
            }
          })
        }
      }
    }
    
    // Convert shopping list to array format
    console.log('🔵 Shopping list object:', shoppingList)
    console.log('🔵 Object keys:', Object.keys(shoppingList))
    const shoppingListArray = Object.values(shoppingList)
    console.log('🔵 Shopping list array:', shoppingListArray)
    
    res.status(200).json({ 
      mealPlan, 
      shoppingList: shoppingListArray 
    })
  } catch (error) {
    console.error('Meal plan generation error:', error)
    res.status(500).json({ error: 'Failed to generate meal plan' })
  }
}

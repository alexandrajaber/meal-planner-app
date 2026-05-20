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
  babySnacks?: string[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { recipes, awayDays, startDate } = req.body

  try {
    const mealPlan: MealPlanDay[] = []
    const shoppingList: Record<string, string> = {}
    
    const start = new Date(startDate)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    // Categorize recipes by type
    const adultRecipes: Recipe[] = recipes.adult || []
    const babyRecipes: Recipe[] = recipes.babyRecipe || []
    const babySnacks: Recipe[] = recipes.babySnack || []
    
    // Create balanced meal rotation
    let recipeIndex = 0
    
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(start)
      currentDate.setDate(start.getDate() + i)
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayName = dayNames[currentDate.getDay()]
      
      const isAway = awayDays.includes(dateStr)
      
      if (isAway) {
        mealPlan.push({
          date: dateStr,
          day: dayName,
          away: true
        })
      } else {
        // Select recipe in rotation
        const recipe = adultRecipes[recipeIndex % adultRecipes.length]
        recipeIndex++
        
        // Determine category based on recipe name (simple heuristic)
        let category = 'meat'
        const name = recipe.name.toLowerCase()
        if (name.includes('fish') || name.includes('salmon') || name.includes('tuna') || name.includes('cod')) {
          category = 'fish'
        } else if (name.includes('veggie') || name.includes('vegetarian') || name.includes('vegan')) {
          category = 'veggie'
        } else if (name.includes('pasta') || name.includes('rice') || name.includes('noodle')) {
          category = 'carbs'
        }
        
        // Select 1-2 baby snacks
        const selectedBabySnacks = []
        if (babySnacks.length > 0) {
          const snack1 = babySnacks[i % babySnacks.length]
          selectedBabySnacks.push(snack1.name)
          if (babySnacks.length > 1) {
            const snack2 = babySnacks[(i + 1) % babySnacks.length]
            if (snack2.id !== snack1.id) {
              selectedBabySnacks.push(snack2.name)
            }
          }
        }
        
        mealPlan.push({
          date: dateStr,
          day: dayName,
          away: false,
          dinner: recipe.name,
          dinnerLink: recipe.link || undefined,
          category: category,
          babySnacks: selectedBabySnacks.length > 0 ? selectedBabySnacks : undefined
        })
        
        // Add ingredients to shopping list
        if (recipe.ingredients) {
          recipe.ingredients.forEach(ingredient => {
            // Simple aggregation - just add to list
            const key = ingredient.toLowerCase()
            if (!shoppingList[key]) {
              shoppingList[key] = ingredient
            }
          })
        }
        
        // Add baby recipe ingredients if selected
        if (babyRecipes.length > 0) {
          const babyRecipe = babyRecipes[i % babyRecipes.length]
          if (babyRecipe.ingredients) {
            babyRecipe.ingredients.forEach(ingredient => {
              const key = ingredient.toLowerCase()
              if (!shoppingList[key]) {
                shoppingList[key] = ingredient
              }
            })
          }
        }
      }
    }
    
    // Convert shopping list to array format
    const shoppingListArray = Object.values(shoppingList)
    
    res.status(200).json({ 
      mealPlan, 
      shoppingList: shoppingListArray 
    })
  } catch (error) {
    console.error('Meal plan generation error:', error)
    res.status(500).json({ error: 'Failed to generate meal plan' })
  }
}
